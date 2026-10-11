import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Every budget has somewhere for money to be recorded.
 *
 * A Shared group was made with a "Bank account", but a Personal budget was
 * made with none, and every save of an entry needs an account. A new person
 * read their M-Pesa messages and Save did nothing at all (5 Oct 2026): the
 * import had no account to save into and stopped without a word. M-Pesa is
 * what Jamvi leads with, so that is the account a budget starts with.
 */
export const DEFAULT_ACCOUNT_NAME = "M-Pesa";

/**
 * And every budget has Cash, built in: "the app should have a cash account
 * hardcoded" (11 Oct 2026). Cash paid in at an agent is a move from Cash into
 * M-Pesa (mobile lib/cashDeposits); with no Cash account it had nowhere to go,
 * and Home asked for those payments for ever. An account already called
 * anything with "cash" in it counts, so nobody gets a second one.
 */
export const CASH_ACCOUNT_NAME = "Cash";

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

const rowsOf = (result: unknown): Array<{ group_id: number }> =>
  ((result as { rows?: Array<{ group_id: number }> }).rows ?? (result as Array<{ group_id: number }>));

/** Gives this budget an M-Pesa account if it has no account at all, and Cash if it has none. Safe to repeat. */
export async function ensureBudgetHasAnAccount(groupId: number, executor: Executor = db): Promise<void> {
  await executor.execute(sql`
    INSERT INTO "bank_accounts" ("group_id", "name", "opening_balance")
    SELECT ${groupId}, ${DEFAULT_ACCOUNT_NAME}, 0
     WHERE NOT EXISTS (SELECT 1 FROM "bank_accounts" WHERE "group_id" = ${groupId})
    ON CONFLICT DO NOTHING`);
  await ensureCashAccount(groupId, executor);
}

/** Gives this budget a Cash account unless it has one already (any name with "cash" in it). Safe to repeat. */
export async function ensureCashAccount(groupId: number, executor: Executor = db): Promise<void> {
  await executor.execute(sql`
    INSERT INTO "bank_accounts" ("group_id", "name", "opening_balance")
    SELECT ${groupId}, ${CASH_ACCOUNT_NAME}, 0
     WHERE NOT EXISTS (SELECT 1 FROM "bank_accounts" WHERE "group_id" = ${groupId} AND "name" ~* '\\mcash\\M')
    ON CONFLICT DO NOTHING`);
}

/**
 * The same for every budget already made without one, once at startup: after
 * the server is listening, and never allowed to stop it.
 */
export async function ensureEveryBudgetHasAnAccount(): Promise<void> {
  try {
    const result = await db.execute(sql`
      INSERT INTO "bank_accounts" ("group_id", "name", "opening_balance")
      SELECT g."id", ${DEFAULT_ACCOUNT_NAME}, 0
        FROM "groups" g
       WHERE NOT EXISTS (SELECT 1 FROM "bank_accounts" b WHERE b."group_id" = g."id")
      ON CONFLICT DO NOTHING
      RETURNING "group_id"`);
    const made = rowsOf(result).length;
    if (made > 0) logger.info({ budgets: made }, "Gave budgets with no account an M-Pesa account");
    const cash = await db.execute(sql`
      INSERT INTO "bank_accounts" ("group_id", "name", "opening_balance")
      SELECT g."id", ${CASH_ACCOUNT_NAME}, 0
        FROM "groups" g
       WHERE NOT EXISTS (SELECT 1 FROM "bank_accounts" b WHERE b."group_id" = g."id" AND b."name" ~* '\\mcash\\M')
      ON CONFLICT DO NOTHING
      RETURNING "group_id"`);
    const withCash = rowsOf(cash).length;
    if (withCash > 0) logger.info({ budgets: withCash }, "Gave budgets a Cash account");
  } catch (err) {
    logger.warn({ err }, "Could not check for budgets with no account");
  }
}
