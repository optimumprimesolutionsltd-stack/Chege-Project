import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { notASplitPart } from "./transaction-splits";

/**
 * Possible duplicates: one payment recorded twice, once typed by hand and once
 * brought in from M-Pesa.
 *
 * An M-Pesa code is unique in a budget (migration 0039), so nothing imported can
 * be saved twice. But an entry typed by hand has no code, so "Lunch 300" typed
 * on the day and the same till payment read from the statement a month later
 * both count as spending. Asked for 5 Oct 2026: "what we want to avoid is a
 * duplicate of entries".
 *
 * The same payment means: the same budget, money moving the same way, the same
 * amount, within a day either side (a payment typed the next morning), and -
 * when both name one - the same account. Two real payments can look like that
 * (bus fare twice a day), so nothing is ever removed here: the person is shown
 * the pair and says which it is. A pair they called different payments is kept
 * in possible_duplicate_dismissals and never shown again.
 *
 * Typed by hand is either an expense ("Add expense"), or an entry on an account
 * with no code that is not a charge, a savings move, a transfer between
 * accounts or an expense's own ledger row (expense_id - the expense is the
 * typed entry).
 */

export type TypedKind = "expense" | "entry";

export type DuplicateSide = {
  kind: TypedKind | "imported";
  id: number;
  date: string;
  amount: number;
  description: string;
  category: string | null;
  receipt: string | null;
};

export type DuplicatePair = { typed: DuplicateSide; imported: DuplicateSide };

let ready = false;

export function possibleDuplicatesReady(): boolean {
  return ready;
}

export function setPossibleDuplicatesReadyForTests(value: boolean): void {
  ready = value;
}

/** The dismissals side table: made after the server is listening, never allowed to stop it. */
export async function ensurePossibleDuplicates(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "possible_duplicate_dismissals" (
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "typed_kind" text NOT NULL,
        "typed_id" integer NOT NULL,
        "imported_id" integer NOT NULL
          REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
        "created_at" timestamp with time zone NOT NULL DEFAULT now(),
        PRIMARY KEY ("typed_kind", "typed_id", "imported_id")
      )`);
    ready = true;
    logger.info("Possible duplicates are ready");
  } catch (err) {
    logger.warn({ err }, "possible_duplicate_dismissals is not available yet; pairs are listed without dismissals");
    const retry = setTimeout(() => void ensurePossibleDuplicates(), 60_000);
    retry.unref?.();
  }
}

// An entry brought in from M-Pesa, spending or money in, that is not a charge or a savings move.
const IMPORTED = sql`
  SELECT id, group_id, account_id, type, amount::numeric AS amount, date, description,
         expense_category AS category, mpesa_receipt AS receipt
  FROM joint_account_transactions
  WHERE mpesa_receipt IS NOT NULL AND charge_for_transaction_id IS NULL AND savings_goal_id IS NULL`;

// Every entry from M-Pesa but its charges - savings moves and transfers too - for checking
// a move being typed by hand (a transfer between accounts, into or out of savings).
const IMPORTED_ANY = sql`
  SELECT id, group_id, account_id, type, amount::numeric AS amount, date, description,
         expense_category AS category, mpesa_receipt AS receipt, savings_goal_id
  FROM joint_account_transactions
  WHERE mpesa_receipt IS NOT NULL AND charge_for_transaction_id IS NULL`;

// Typed by hand, both kinds, in one shape. A part of a split payment has no code of
// its own but was never typed: it is its payment's (lib/transaction-splits).
const TYPED_ROWS = () => sql`
  SELECT 'entry'::text AS kind, id, group_id, account_id, type, amount::numeric AS amount, date, description,
         expense_category AS category
  FROM joint_account_transactions
  WHERE mpesa_receipt IS NULL AND charge_for_transaction_id IS NULL AND savings_goal_id IS NULL
    AND expense_id IS NULL AND bank_transfer_id IS NULL
    ${notASplitPart(sql`joint_account_transactions.id`)}
  UNION ALL
  SELECT 'expense'::text, id, group_id, account_id, 'disbursement'::text, amount::numeric, date, description, category
  FROM expenses`;

const dismissed = () =>
  ready
    ? sql`AND NOT EXISTS (SELECT 1 FROM possible_duplicate_dismissals d
          WHERE d.typed_kind = t.kind AND d.typed_id = t.id AND d.imported_id = i.id)`
    : sql``;

type Row = Record<string, unknown>;
const side = (row: Row, prefix: string, kind: DuplicateSide["kind"]): DuplicateSide => ({
  kind,
  id: Number(row[`${prefix}id`]),
  date: String(row[`${prefix}date`]).slice(0, 10),
  amount: Number(row[`${prefix}amount`]),
  description: String(row[`${prefix}description`] ?? ""),
  category: (row[`${prefix}category`] as string | null) ?? null,
  receipt: (row[`${prefix}receipt`] as string | null) ?? null,
});

/** Every pair in this budget still waiting for the person's answer, newest first. */
export async function listPossibleDuplicates(groupId: number, limit = 200): Promise<DuplicatePair[]> {
  const result = await db.execute(sql`
    SELECT t.kind AS t_kind, t.id AS t_id, t.date AS t_date, t.amount AS t_amount, t.description AS t_description,
           t.category AS t_category, NULL AS t_receipt,
           i.id AS i_id, i.date AS i_date, i.amount AS i_amount, i.description AS i_description,
           i.category AS i_category, i.receipt AS i_receipt
    FROM (${TYPED_ROWS()}) t
    JOIN (${IMPORTED}) i
      ON i.group_id = t.group_id AND i.type = t.type AND i.amount = t.amount
     AND abs(i.date - t.date) <= 1
     AND (t.account_id IS NULL OR i.account_id IS NULL OR t.account_id = i.account_id)
    WHERE t.group_id = ${groupId} ${dismissed()}
    ORDER BY i.date DESC, i.id DESC
    LIMIT ${limit}`);
  return (result.rows as Row[]).map((row) => ({
    typed: side(row, "t_", row.t_kind as TypedKind),
    imported: side(row, "i_", "imported"),
  }));
}

/** The person said these are two different payments: never shown together again. */
export async function dismissPair(groupId: number, typedKind: TypedKind, typedId: number, importedId: number): Promise<void> {
  await db.execute(sql`
    INSERT INTO possible_duplicate_dismissals (group_id, typed_kind, typed_id, imported_id)
    SELECT ${groupId}, ${typedKind}, ${typedId}, ${importedId}
    WHERE EXISTS (SELECT 1 FROM joint_account_transactions WHERE id = ${importedId} AND group_id = ${groupId})
    ON CONFLICT DO NOTHING`);
}

export type Candidate = {
  /** The caller's own name for it, echoed back. */
  key: string;
  amount: number;
  date: string;
  direction: "in" | "out";
  accountId?: number | null;
  /**
   * A savings goal or account the money moves into or out of: then only M-Pesa
   * entries moving money for that same goal match (a Contribute typed by hand
   * against an M-Shwari deposit read from a statement).
   */
  goalId?: number | null;
};

/**
 * For each candidate, the entries in this budget that could be the same payment:
 * `against: "typed"` looks among entries typed by hand (for lines being imported),
 * `against: "imported"` among entries from M-Pesa (for an entry being typed - "a
 * warning when something the app has picked is picked again", 5 Oct 2026).
 */
export async function findTwins(
  groupId: number,
  candidates: readonly Candidate[],
  against: "typed" | "imported",
): Promise<Array<{ key: string; entries: DuplicateSide[] }>> {
  if (candidates.length === 0) return [];
  const values = sql.join(
    candidates.map((c) => sql`(${c.key}, ${c.amount}::numeric, ${c.date}::date, ${c.direction === "in" ? "deposit" : "disbursement"}, ${c.accountId ?? null}::integer, ${c.goalId ?? null}::integer)`),
    sql`, `,
  );
  const pool = against === "typed" ? TYPED_ROWS() : IMPORTED_ANY;
  const result = await db.execute(sql`
    SELECT c.key, p.id, p.date, p.amount, p.description, p.category,
           ${against === "typed" ? sql`p.kind` : sql`'imported'::text`} AS kind,
           ${against === "typed" ? sql`NULL` : sql`p.receipt`} AS receipt
    FROM (VALUES ${values}) AS c(key, amount, date, type, account_id, goal_id)
    JOIN (${pool}) p
      ON p.group_id = ${groupId} AND p.type = c.type AND p.amount = c.amount
     AND abs(p.date - c.date) <= 1
     AND (c.account_id IS NULL OR p.account_id IS NULL OR p.account_id = c.account_id)
     ${against === "imported" ? sql`AND (c.goal_id IS NULL OR p.savings_goal_id = c.goal_id)` : sql``}
    ORDER BY c.key, abs(p.date - c.date), p.id
    LIMIT 2000`);
  const byKey = new Map<string, DuplicateSide[]>();
  for (const row of result.rows as Row[]) {
    const key = String(row.key);
    const list = byKey.get(key) ?? [];
    list.push(side(row, "", row.kind as DuplicateSide["kind"]));
    byKey.set(key, list);
  }
  return [...byKey].map(([key, entries]) => ({ key, entries }));
}

/**
 * M-Pesa codes among these that are already in another budget the person
 * belongs to: one statement imported into Personal and into a chama would
 * otherwise record a payment in both (the code is unique per budget only).
 * Only budgets with the same owner as this one: a budget somebody else owns
 * keeps its own record of the same payment.
 */
export async function receiptsElsewhere(
  groupId: number,
  userId: string,
  receipts: readonly string[],
): Promise<Array<{ receipt: string; budget: string }>> {
  if (receipts.length === 0) return [];
  const result = await db.execute(sql`
    SELECT DISTINCT ON (t.mpesa_receipt) t.mpesa_receipt AS receipt, g.name AS budget
    FROM joint_account_transactions t
    JOIN group_memberships m ON m.group_id = t.group_id AND m.user_id = ${userId}
    JOIN groups g ON g.id = t.group_id
    WHERE t.group_id <> ${groupId}
      -- Only a budget with the same owner as this one. A budget somebody else owns
      -- keeps its own record of the same payment: "the two workspaces do not belong
      -- to one owner and do not share a group" (9 Oct 2026).
      AND EXISTS (
        SELECT 1 FROM group_memberships other_owner
        JOIN group_memberships this_owner ON this_owner.user_id = other_owner.user_id
        WHERE other_owner.group_id = t.group_id AND other_owner.role = 'owner'
          AND this_owner.group_id = ${groupId} AND this_owner.role = 'owner'
      )
      AND t.mpesa_receipt IN (${sql.join(receipts.map((code) => sql`${code}`), sql`, `)})
    ORDER BY t.mpesa_receipt, t.id`);
  return (result.rows as Row[]).map((row) => ({ receipt: String(row.receipt), budget: String(row.budget) }));
}
