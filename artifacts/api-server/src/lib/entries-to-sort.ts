import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { notOwnerBusinessMoney } from "./owner-business-money";

/**
 * Entries saved as "Not sure", to be sorted out later (migration 0053).
 *
 * Working through a year's statement, somebody often cannot say what an old
 * entry was. They save it anyway and Home reminds them:
 * - money out goes to the category NOT_SURE_CATEGORY, so it still counts as
 *   spending (every spending total needs a category) and is found by that;
 * - money in is saved with no income source and marked here, because an entry
 *   with no source is not otherwise something anybody asked to come back to.
 *
 * A side table like mpesa_entry_names: made after the server is listening,
 * never allowed to stop it, read only once it exists.
 */
export const NOT_SURE_CATEGORY = "Not sure yet";

let ready = false;

export function entriesToSortReady(): boolean {
  return ready;
}

export function setEntriesToSortReadyForTests(value: boolean): void {
  ready = value;
}

export async function ensureEntriesToSort(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "entries_to_sort" (
        "transaction_id" integer PRIMARY KEY
          REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "entries_to_sort_group_idx" ON "entries_to_sort" ("group_id")`);
    // Money in the person chose to leave with no source ("Leave it with no
    // source"), so gathering never puts it back on the list.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "entries_left_unsourced" (
        "transaction_id" integer PRIMARY KEY
          REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    // Money in saved earlier from a person, a bank or an agent, with a
    // source Jamvi may have guessed: listed once to check (gatherSourcedToCheck).
    // `income_source_id` is the source it had then; changing it takes it off.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "entries_to_check" (
        "transaction_id" integer PRIMARY KEY
          REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "income_source_id" integer NOT NULL,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "entries_to_check_group_idx" ON "entries_to_check" ("group_id")`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "entries_to_check_gathered" (
        "group_id" integer PRIMARY KEY REFERENCES "groups"("id") ON DELETE CASCADE,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    ready = true;
    logger.info("Entries to sort are ready");
  } catch (err) {
    logger.warn({ err }, "entries_to_sort is not available yet; only Not sure yet spending is listed to sort");
    const retry = setTimeout(() => void ensureEntriesToSort(), 60_000);
    retry.unref?.();
  }
}

/**
 * Puts every plain money in with no income source on the list to sort, from a
 * day on or from the start: not borrowing (Fuliza included), a repayment, a
 * move between accounts or to and from savings, a member's contribution,
 * either half of a reversal, or one the person chose to leave with no source.
 * "Want to fix old entries too - ship all to sort them out" (7 Oct 2026):
 * done each time the list is read, so nothing waits on a button. How many were
 * added.
 *
 * In a Shared group money in is mostly members' contributions, which need no
 * source, so only money in brought in from M-Pesa from a person, a bank or an
 * agent is gathered there ("should also apply to shared budget too", 8 Oct 2026).
 */
export async function gatherMoneyInWithoutSource(groupId: number, from?: string, shared = false): Promise<number> {
  if (!ready) return 0;
  const since = from ? sql`AND t."date" >= ${from}` : sql``;
  const sharedOnly = shared ? fromPeopleBanksAgents : sql``;
  const added = await db.execute(sql`
    INSERT INTO "entries_to_sort" ("transaction_id", "group_id")
    SELECT t."id", t."group_id"
    FROM "joint_account_transactions" t
    WHERE t."group_id" = ${groupId}
      AND t."type" = 'deposit'
      AND t."income_source_id" IS NULL
      AND t."is_borrowing" = false
      AND t."settles_contributor_id" IS NULL
      AND t."savings_goal_id" IS NULL
      AND t."bank_transfer_id" IS NULL
      AND t."transfer_direction" IS NULL
      ${notOwnerBusinessMoney(sql`t."id"`)}
      AND NOT EXISTS (
        SELECT 1 FROM "joint_account_deposit_splits" s
        WHERE s."transaction_id" = t."id" AND s."contributor_id" IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1 FROM "reversal_links" r
        WHERE r."reversal_transaction_id" = t."id" OR r."original_transaction_id" = t."id")
      AND NOT EXISTS (
        SELECT 1 FROM "entries_left_unsourced" l WHERE l."transaction_id" = t."id")
      ${since}
      ${sharedOnly}
    ON CONFLICT ("transaction_id") DO NOTHING
    RETURNING "transaction_id"`);
  return (added as { rows?: unknown[] }).rows?.length ?? 0;
}

/**
 * How an imported entry from a person, a bank or a cash deposit at an agent was
 * worded when it was saved: "Received from ..." (lib/mpesa-parser, the web's
 * statement-import), "Money received", the agent's "Deposit of Funds at Agent",
 * or a bank's name (the phone and web isBankPayee, with Postgres word edges).
 */
export const FROM_PEOPLE_BANKS_AGENTS = String.raw`^(received from |money received$|deposit of funds)`;
export const BANK_NAME = String.raw`\y(bank|paybill account|equity|kcb|co-?op(erative)?|ncba|stanbic|absa|i\s?&\s?m|dtb|diamond trust|stanchart|standard chartered|sidian|sbm|gulf african|family bank|prime bank|credit bank|bank of africa|consolidated bank|national bank|housing finance|hfc)\y`;

/** Imported money in from a person, a bank or an agent. */
const fromPeopleBanksAgents = sql`AND t."mpesa_receipt" IS NOT NULL AND (t."description" ~* ${FROM_PEOPLE_BANKS_AGENTS} OR t."description" ~* ${BANK_NAME})`;

/**
 * Money in from people, banks and agents, saved from M-Pesa before these
 * started under Not sure, that has a source: the source may have been
 * Jamvi's guess, and nothing saved says whether it was. "Ensure to sort what
 * is done historically" (8 Oct 2026) - each is listed to check with its source
 * kept, never cleared, since the person may have chosen it. Done once per
 * budget; what is checked or changed stays off. Every budget, Shared groups
 * too: only imported money in is ever gathered. How many were added.
 */
export async function gatherSourcedToCheck(groupId: number): Promise<number> {
  if (!ready) return 0;
  return db.transaction(async (trx) => {
    const first = await trx.execute(sql`
      INSERT INTO "entries_to_check_gathered" ("group_id") VALUES (${groupId})
      ON CONFLICT ("group_id") DO NOTHING
      RETURNING "group_id"`);
    if (((first as { rows?: unknown[] }).rows?.length ?? 0) === 0) return 0;
    const added = await trx.execute(sql`
      INSERT INTO "entries_to_check" ("transaction_id", "group_id", "income_source_id")
      SELECT t."id", t."group_id", t."income_source_id"
      FROM "joint_account_transactions" t
      WHERE t."group_id" = ${groupId}
        AND t."type" = 'deposit'
        AND t."income_source_id" IS NOT NULL
        AND t."mpesa_receipt" IS NOT NULL
        AND (t."description" ~* ${FROM_PEOPLE_BANKS_AGENTS} OR t."description" ~* ${BANK_NAME})
        AND t."is_borrowing" = false
        AND t."settles_contributor_id" IS NULL
        AND t."savings_goal_id" IS NULL
        AND t."bank_transfer_id" IS NULL
        AND t."transfer_direction" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "reversal_links" r
          WHERE r."reversal_transaction_id" = t."id" OR r."original_transaction_id" = t."id")
      ON CONFLICT ("transaction_id") DO NOTHING
      RETURNING "transaction_id"`);
    return (added as { rows?: unknown[] }).rows?.length ?? 0;
  });
}
