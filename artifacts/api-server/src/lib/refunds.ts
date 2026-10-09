import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import { NOT_SURE_CATEGORY } from "./entries-to-sort";

/**
 * Money back as a refund.
 *
 * "Reversal should take its own course without necessarily tagging a previous
 * pay" - "a refund" (9 Oct 2026). A reversed or refunded payment is stored as
 * a payment out with a negative amount in a category: every spending total
 * adds payments up, so each one nets it out of that category without knowing
 * refunds exist, and the account balance comes out right. Nothing is linked to
 * the payment it undid, so nothing is ever locked against editing.
 *
 * Its category is the one same-day payment of that amount, when there is
 * exactly one such category; otherwise Not sure yet, for Sort them out.
 */

type Db = Pick<typeof db, "execute">;

/** Where a refund of this amount on this day belongs, or null when the budget has nowhere to put it. */
export async function refundCategoryFor(
  database: Db,
  groupId: number,
  date: string,
  amount: number,
): Promise<string | null> {
  const same = await database.execute(sql`
    SELECT DISTINCT t.expense_category AS category
    FROM joint_account_transactions t
    WHERE t.group_id = ${groupId} AND t.type = 'disbursement' AND t.amount = ${amount}
      AND t.date = ${date}::date AND t.expense_category IS NOT NULL`);
  const categories = (same.rows as Array<{ category: string }>).map((row) => row.category);
  if (categories.length === 1) return categories[0];
  const notSure = await database.execute(sql`
    SELECT name FROM budget_categories WHERE group_id = ${groupId} AND lower(name) = lower(${NOT_SURE_CATEGORY}) LIMIT 1`);
  return (notSure.rows as Array<{ name: string }>)[0]?.name ?? null;
}

let converting = false;

/**
 * Once, at startup: money-back entries saved before refunds existed become
 * refunds. Every change is written to refund_conversions first (the row as it
 * was, and the link if it had one), so it can be put back. Run again it finds
 * nothing left to do.
 *
 * - A linked pair: the payment it undid gets back the category the link took
 *   off it; the money back becomes a refund in that category; the link goes.
 * - Money back with no link: a refund in the same-day payment's category, or
 *   Not sure yet.
 * - Money back somebody has since filed under an income source is left as it
 *   is: they said it is income (the import can misread a line as a reversal).
 */
export async function convertMoneyBackToRefunds(): Promise<void> {
  if (converting) return;
  converting = true;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "refund_conversions" (
        "transaction_id" integer PRIMARY KEY,
        "group_id" integer NOT NULL,
        "before" jsonb NOT NULL,
        "link" jsonb,
        "converted_at" timestamp with time zone NOT NULL DEFAULT now()
      )`);
    const linksExist = (await db.execute(sql`SELECT to_regclass('public.reversal_links') IS NOT NULL AS present`)).rows[0] as { present: boolean };
    const candidates = await db.execute(sql`
      SELECT t.*, ${linksExist.present ? sql`rl.original_transaction_id AS "linkedOriginal", rl.original_category AS "linkedCategory"` : sql`NULL::integer AS "linkedOriginal", NULL::text AS "linkedCategory"`}
      FROM joint_account_transactions t
      ${linksExist.present ? sql`LEFT JOIN reversal_links rl ON rl.reversal_transaction_id = t.id` : sql``}
      WHERE t.type = 'deposit' AND t.description ILIKE 'Money back%' AND t.income_source_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM refund_conversions c WHERE c.transaction_id = t.id)
      ORDER BY t.id
      LIMIT 5000`);
    let converted = 0;
    let linked = 0;
    let notSure = 0;
    for (const row of candidates.rows as Array<Record<string, unknown>>) {
      const id = Number(row.id);
      const groupId = Number(row.group_id);
      const amount = Math.abs(Number(row.amount));
      const date = String(row.date instanceof Date ? row.date.toISOString() : row.date).slice(0, 10);
      const originalId = row.linkedOriginal == null ? null : Number(row.linkedOriginal);
      const originalCategory = row.linkedCategory == null ? null : String(row.linkedCategory);
      const { linkedOriginal: _a, linkedCategory: _b, ...before } = row;
      await db.transaction(async (trx) => {
        let category: string | null = null;
        if (originalId !== null) {
          // The payment it undid counts as spending again, under its own category.
          await trx.execute(sql`UPDATE joint_account_transactions SET expense_category = ${originalCategory}
            WHERE id = ${originalId} AND group_id = ${groupId} AND expense_category IS NULL`);
          const kept = await trx.execute(sql`SELECT expense_category FROM joint_account_transactions WHERE id = ${originalId}`);
          category = (kept.rows[0] as { expense_category: string | null } | undefined)?.expense_category ?? originalCategory;
          await trx.execute(sql`DELETE FROM reversal_links WHERE reversal_transaction_id = ${id}`);
          linked += 1;
        }
        if (!category) category = await refundCategoryFor(trx, groupId, date, amount);
        if (category && category.toLowerCase() === NOT_SURE_CATEGORY.toLowerCase()) notSure += 1;
        await trx.execute(sql`INSERT INTO refund_conversions (transaction_id, group_id, before, link)
          VALUES (${id}, ${groupId}, ${JSON.stringify(before)}::jsonb,
            ${originalId === null ? null : JSON.stringify({ originalTransactionId: originalId, originalCategory })}::jsonb)`);
        await trx.execute(sql`UPDATE joint_account_transactions
          SET type = 'disbursement', amount = ${-amount}, expense_category = ${category}
          WHERE id = ${id} AND group_id = ${groupId}`);
      });
      converted += 1;
    }
    if (converted > 0) logger.info({ converted, linked, notSure }, "money back converted to refunds");
  } catch (error) {
    // Never stops the server: tried again at the next start.
    logger.error({ error }, "converting money back to refunds failed");
  } finally {
    converting = false;
  }
}
