import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { logger } from "./logger";
import { entriesToSortReady } from "./entries-to-sort";
import { ownerBusinessReady } from "./owner-business-money";
import { reversalLinksReady } from "./reversal-links";

/**
 * One payment, more than one category.
 *
 * "My wife appears under family support - but money sent to her should be to
 * cover rent or school fees etc. Rent shouldn't appear as blank while the money
 * lies in family support" (10 Oct 2026). Money out can be split: each part is
 * an entry of its own - same day, same account, same payee, its own category -
 * and the payment it came from (the "root") keeps the rest. Every spending
 * figure already adds entries up by category, so none of them needs to know.
 * Only what lays entries against M-Pesa's messages does: a part has no code of
 * its own and belongs to its root's message (Find the difference adds it in, as
 * it does a charge).
 *
 * Parts are split off for two reasons:
 *  - "covers": what a person's money covers, said once ("Jane's money covers
 *    Rent 15,000 a month, then the rest is Family support"); every payment to
 *    them fills those first, up to each amount for the month;
 *  - "move": "move KES 3,000 from Family support to School fees this month",
 *    taken from that month's entries under Family support, newest first.
 * Undoing puts every part back into its root. Deleting a part puts its money
 * back into the root too: the M-Pesa payment still happened.
 *
 * Kept in a side table, made after the server is listening, like
 * owner_business_money: never allowed to stop it, read only once it exists.
 */

let ready = false;

export function splitsReady(): boolean {
  return ready;
}

export function setSplitsReadyForTests(value: boolean): void {
  ready = value;
}

export async function ensureTransactionSplits(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "transaction_splits" (
        "part_transaction_id" integer PRIMARY KEY
          REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
        "root_transaction_id" integer NOT NULL
          REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "reason" text NOT NULL,
        "payee_key" text,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "transaction_splits_root_idx" ON "transaction_splits" ("root_transaction_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "transaction_splits_group_idx" ON "transaction_splits" ("group_id", "payee_key")`);
    // Payments a person's "covers" were applied to, split or not: counted for the
    // month (a payment can become a covered part itself), and never applied twice.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "covers_applied" (
        "transaction_id" integer PRIMARY KEY
          REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
        "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
        "payee_key" text NOT NULL,
        "created_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "covers_applied_group_idx" ON "covers_applied" ("group_id", "payee_key")`);
    ready = true;
    logger.info("Split payments are ready");
  } catch (err) {
    logger.warn({ err }, "transaction_splits is not available yet; payments stay in one category");
    const retry = setTimeout(() => void ensureTransactionSplits(), 60_000);
    retry.unref?.();
  }
}

/** The condition a query adds to leave out parts of a split payment. `id` as the calling query names it. */
export function notASplitPart(id: SQL | unknown): SQL {
  if (!ready) return sql``;
  return sql`AND NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.part_transaction_id = ${id})`;
}

/** Each part's root, for this budget: part id -> root id. */
export async function splitRoots(groupId: number): Promise<Map<number, number>> {
  if (!ready) return new Map();
  const result = await db.execute(sql`SELECT "part_transaction_id" AS part, "root_transaction_id" AS root FROM "transaction_splits" WHERE "group_id" = ${groupId}`);
  return new Map((result.rows as Array<{ part: number; root: number }>).map((row) => [Number(row.part), Number(row.root)]));
}

export type Part = { category: string; amount: number };
type Trx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Row = {
  id: number; amount: number; description: string; date: string; account_id: number | null; made_by_id: string | null;
  expense_category: string | null; root: number | null;
};

const cents = (value: number) => Math.round(value * 100);

/** A payment that can be split: plain money out of this budget, nothing else hanging on it. */
function splittable(alias: string): SQL {
  const t = sql.raw(alias);
  return sql`
    ${t}."type" = 'disbursement'
    AND ${t}."bank_transfer_id" IS NULL
    AND ${t}."savings_goal_id" IS NULL
    AND ${t}."transfer_direction" IS NULL
    AND ${t}."charge_for_transaction_id" IS NULL
    AND ${t}."expense_id" IS NULL
    AND ${t}."is_lending" = false
    AND ${t}."settles_contributor_id" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "debt_entry_links" d WHERE d."transaction_id" = ${t}."id")
    ${ownerBusinessReady() ? sql`AND NOT EXISTS (SELECT 1 FROM "owner_business_money" o WHERE o."transaction_id" = ${t}."id")` : sql``}
    ${reversalLinksReady() ? sql`AND NOT EXISTS (SELECT 1 FROM "reversal_links" r WHERE r."reversal_transaction_id" = ${t}."id" OR r."original_transaction_id" = ${t}."id")` : sql``}`;
}

async function lockEntry(trx: Trx, groupId: number, id: number): Promise<Row | null> {
  const found = await trx.execute(sql`
    SELECT t."id", t."amount", t."description", t."date"::text AS "date", t."account_id", t."made_by_id", t."expense_category",
           (SELECT ts."root_transaction_id" FROM "transaction_splits" ts WHERE ts."part_transaction_id" = t."id") AS "root"
      FROM "joint_account_transactions" t
     WHERE t."id" = ${id} AND t."group_id" = ${groupId} AND ${splittable("t")}
       FOR UPDATE OF t`);
  const row = found.rows[0] as Row | undefined;
  return row ? { ...row, id: Number(row.id), amount: Number(row.amount), root: row.root == null ? null : Number(row.root) } : null;
}

/**
 * Splits `parts` off an entry. The entry keeps the rest under `rest` (or its own
 * category); when nothing is left, it becomes the last part itself. Parts are
 * linked to the entry's root, so a part split again still undoes in one go.
 * Returns the ids of the parts made, or null when the entry cannot be split.
 */
export async function splitOff(
  trx: Trx,
  groupId: number,
  entryId: number,
  parts: readonly Part[],
  meta: { reason: "covers" | "move" | "manual"; payeeKey?: string | null; rest?: string | null; note?: string | null },
): Promise<number[] | null> {
  const entry = await lockEntry(trx, groupId, entryId);
  if (!entry) return null;
  const wanted = parts.filter((part) => cents(part.amount) > 0 && part.category.trim());
  const taken = wanted.reduce((sum, part) => sum + cents(part.amount), 0);
  if (wanted.length === 0 || taken > cents(entry.amount)) return null;
  const left = cents(entry.amount) - taken;
  // Nothing left for the entry: it becomes the last part.
  const own = left === 0 ? wanted[wanted.length - 1] : null;
  const made = own ? wanted.slice(0, -1) : wanted;
  const root = entry.root ?? entry.id;
  const ids: number[] = [];
  for (const part of made) {
    const inserted = await trx.execute(sql`
      INSERT INTO "joint_account_transactions"
        ("group_id", "account_id", "type", "amount", "description", "date", "made_by_id", "expense_category", "notes")
      VALUES (${groupId}, ${entry.account_id}, 'disbursement', ${cents(part.amount) / 100}, ${entry.description}, ${entry.date},
              ${entry.made_by_id}, ${part.category.trim()}, ${meta.note ?? null})
      RETURNING "id"`);
    const id = Number((inserted.rows[0] as { id: number }).id);
    await trx.execute(sql`
      INSERT INTO "transaction_splits" ("part_transaction_id", "root_transaction_id", "group_id", "reason", "payee_key")
      VALUES (${id}, ${root}, ${groupId}, ${meta.reason}, ${meta.payeeKey ?? null})`);
    ids.push(id);
  }
  const category = own ? own.category.trim() : meta.rest?.trim() || entry.expense_category;
  await trx.execute(sql`
    UPDATE "joint_account_transactions"
       SET "amount" = ${(own ? cents(own.amount) : left) / 100}, "expense_category" = ${category}
     WHERE "id" = ${entry.id} AND "group_id" = ${groupId}`);
  if (own && meta.payeeKey && entry.root !== null) {
    await trx.execute(sql`UPDATE "transaction_splits" SET "payee_key" = ${meta.payeeKey} WHERE "part_transaction_id" = ${entry.id}`);
  }
  // Sorted now: no longer waiting under Not sure yet.
  if (entriesToSortReady()) await trx.execute(sql`DELETE FROM "entries_to_sort" WHERE "transaction_id" = ${entry.id} AND "group_id" = ${groupId}`);
  return ids;
}

/** A person's money, as the person said it is used: each amount a month, then the rest. */
export type Covers = { payeeKey: string; plan: Array<{ category: string; monthly: number }>; rest: string };

/** How much of each covered category this payee's payments already filled in the month of `date`. */
async function coveredThisMonth(trx: Trx, groupId: number, payeeKey: string, date: string): Promise<Map<string, number>> {
  // Each payment the person's covers were applied to, and every part split off it, by category.
  const result = await trx.execute(sql`
    SELECT t."expense_category" AS category, COALESCE(SUM(t."amount"), 0) AS amount
      FROM "covers_applied" ca
      JOIN "joint_account_transactions" t
        ON t."id" = ca."transaction_id"
        OR t."id" IN (SELECT ts."part_transaction_id" FROM "transaction_splits" ts WHERE ts."root_transaction_id" = ca."transaction_id")
     WHERE ca."group_id" = ${groupId} AND ca."payee_key" = ${payeeKey}
       AND date_trunc('month', t."date") = date_trunc('month', ${date}::date)
     GROUP BY t."expense_category"`);
  return new Map((result.rows as Array<{ category: string; amount: number | string }>).map((row) => [row.category, cents(Number(row.amount))]));
}

/** The parts a payment of `amount` makes, given what this month already covered. Pure, for tests. */
export function coversParts(amount: number, plan: Covers["plan"], used: ReadonlyMap<string, number>): Part[] {
  let left = cents(amount);
  const parts: Part[] = [];
  for (const item of plan) {
    if (left <= 0) break;
    const room = Math.max(0, cents(item.monthly) - (used.get(item.category) ?? 0));
    const take = Math.min(room, left);
    if (take > 0) parts.push({ category: item.category, amount: take / 100 });
    left -= take;
  }
  return parts;
}

/**
 * What a person's money covers, applied to their payments not split yet. A
 * payment that covers nothing this month (each amount already filled) is only
 * put under the rest. Returns how many payments were split.
 */
export async function applyCovers(groupId: number, entryIds: readonly number[], covers: Covers): Promise<number> {
  let split = 0;
  for (const id of [...new Set(entryIds)].sort((a, b) => a - b)) {
    const done = await db.transaction(async (trx) => {
      const entry = await lockEntry(trx, groupId, id);
      // Already split, or a part itself: left as it is.
      if (!entry || entry.root !== null) return false;
      const already = await trx.execute(sql`
        SELECT 1 FROM "transaction_splits" WHERE "root_transaction_id" = ${id}
        UNION ALL SELECT 1 FROM "covers_applied" WHERE "transaction_id" = ${id} LIMIT 1`);
      if (already.rows.length > 0) return false;
      const parts = coversParts(entry.amount, covers.plan, await coveredThisMonth(trx, groupId, covers.payeeKey, entry.date));
      if (parts.length === 0) {
        await trx.execute(sql`UPDATE "joint_account_transactions" SET "expense_category" = ${covers.rest} WHERE "id" = ${id} AND "group_id" = ${groupId}`);
      } else if ((await splitOff(trx, groupId, id, parts, { reason: "covers", payeeKey: covers.payeeKey, rest: covers.rest })) === null) {
        return false;
      }
      await trx.execute(sql`INSERT INTO "covers_applied" ("transaction_id", "group_id", "payee_key") VALUES (${id}, ${groupId}, ${covers.payeeKey})`);
      return true;
    });
    if (done) split += 1;
  }
  return split;
}

/**
 * Money moved between two categories for a month: taken from that month's
 * entries under `from`, newest first, until `amount` is moved. Returns what was
 * moved (less than asked when `from` held less).
 */
export async function moveBetween(groupId: number, move: { from: string; to: string; amount: number; month: number; year: number; note?: string | null }): Promise<number> {
  return db.transaction(async (trx) => {
    const found = await trx.execute(sql`
      SELECT t."id", t."amount" FROM "joint_account_transactions" t
       WHERE t."group_id" = ${groupId} AND t."expense_category" = ${move.from}
         AND EXTRACT(MONTH FROM t."date") = ${move.month} AND EXTRACT(YEAR FROM t."date") = ${move.year}
         AND ${splittable("t")}
       ORDER BY t."date" DESC, t."id" DESC`);
    let left = cents(move.amount);
    for (const row of found.rows as Array<{ id: number; amount: number | string }>) {
      if (left <= 0) break;
      const take = Math.min(left, cents(Number(row.amount)));
      const note = move.note?.trim() || `Moved from ${move.from}`;
      if ((await splitOff(trx, groupId, Number(row.id), [{ category: move.to, amount: take / 100 }], { reason: "move", note })) !== null) left -= take;
    }
    return (cents(move.amount) - left) / 100;
  });
}

/** Every part of a payment put back into it. Returns how many parts there were. */
export async function undoSplit(groupId: number, entryId: number): Promise<number> {
  return db.transaction(async (trx) => {
    const rootOf = await trx.execute(sql`SELECT "root_transaction_id" AS root FROM "transaction_splits" WHERE "part_transaction_id" = ${entryId} AND "group_id" = ${groupId}`);
    const root = Number((rootOf.rows[0] as { root?: number } | undefined)?.root ?? entryId);
    const parts = await trx.execute(sql`
      SELECT t."id", t."amount" FROM "transaction_splits" ts
        JOIN "joint_account_transactions" t ON t."id" = ts."part_transaction_id"
       WHERE ts."root_transaction_id" = ${root} AND ts."group_id" = ${groupId}
         FOR UPDATE OF t`);
    const rows = parts.rows as Array<{ id: number; amount: number | string }>;
    if (rows.length === 0) return 0;
    const back = rows.reduce((sum, row) => sum + cents(Number(row.amount)), 0);
    await trx.execute(sql`UPDATE "joint_account_transactions" SET "amount" = "amount" + ${back / 100} WHERE "id" = ${root} AND "group_id" = ${groupId}`);
    await trx.execute(sql`DELETE FROM "joint_account_transactions" WHERE "group_id" = ${groupId} AND "id" IN (${sql.join(rows.map((row) => sql`${Number(row.id)}`), sql`, `)})`);
    return rows.length;
  });
}

/**
 * Before an entry is deleted: a part's money goes back into its root (the M-Pesa
 * payment still happened); a root's parts go with it. Returns true when the
 * entry was a part and has been dealt with here.
 */
export async function beforeDelete(trx: Trx, groupId: number, entryId: number): Promise<boolean> {
  if (!ready) return false;
  const asPart = await trx.execute(sql`
    SELECT ts."root_transaction_id" AS root, t."amount" FROM "transaction_splits" ts
      JOIN "joint_account_transactions" t ON t."id" = ts."part_transaction_id"
     WHERE ts."part_transaction_id" = ${entryId} AND ts."group_id" = ${groupId}`);
  const part = asPart.rows[0] as { root: number; amount: number | string } | undefined;
  if (part) {
    await trx.execute(sql`UPDATE "joint_account_transactions" SET "amount" = "amount" + ${Number(part.amount)} WHERE "id" = ${Number(part.root)} AND "group_id" = ${groupId}`);
    await trx.execute(sql`DELETE FROM "joint_account_transactions" WHERE "id" = ${entryId} AND "group_id" = ${groupId}`);
    return true;
  }
  await trx.execute(sql`
    DELETE FROM "joint_account_transactions" WHERE "group_id" = ${groupId}
       AND "id" IN (SELECT "part_transaction_id" FROM "transaction_splits" WHERE "root_transaction_id" = ${entryId})`);
  return false;
}

/** Whether an entry is split or a part of one: its amount then cannot change on its own. */
export async function isSplit(groupId: number, entryId: number): Promise<boolean> {
  if (!ready) return false;
  const result = await db.execute(sql`
    SELECT 1 FROM "transaction_splits" WHERE "group_id" = ${groupId}
       AND ("part_transaction_id" = ${entryId} OR "root_transaction_id" = ${entryId}) LIMIT 1`);
  return result.rows.length > 0;
}
