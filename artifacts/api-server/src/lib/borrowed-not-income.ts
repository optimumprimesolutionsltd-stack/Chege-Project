import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Borrowed money, and money paid back by somebody who owed it, is not income,
 * so it has no income source.
 *
 * Editing money in to "Borrowed from Ujenzi" on Bank used to save only the
 * lender link: the entry was never marked borrowed and kept "Ujenzi salary",
 * so it still counted as income ("if the money is borrowed, income source
 * shouldnt be there", 8 Oct 2026). The edit is fixed (routes/joint-account);
 * this puts right what it left behind. Run at every start - each update only
 * touches rows still wrong, so after the first run it changes nothing.
 */
export async function fixBorrowedNotIncome(): Promise<void> {
  try {
    const marked = await db.execute(sql`
      UPDATE "joint_account_transactions" t
         SET "is_borrowing" = true, "income_source_id" = NULL
        FROM "debt_entry_links" l
       WHERE l."transaction_id" = t."id"
         AND l."kind" = 'borrowed'
         AND t."type" = 'deposit'
         AND t."is_borrowing" = false
      RETURNING t."id"`);
    const cleared = await db.execute(sql`
      UPDATE "joint_account_transactions"
         SET "income_source_id" = NULL
       WHERE "type" = 'deposit'
         AND "income_source_id" IS NOT NULL
         AND ("is_borrowing" = true OR "settles_contributor_id" IS NOT NULL)
      RETURNING "id"`);
    // A payment to somebody you owe that kept "Not sure yet" from before it was
    // sorted: the debt is its answer, so it needs no category and leaves the list
    // ("made changes but still showing not sure yet", 8 Oct 2026).
    const notSureDebts = await db.execute(sql`
      UPDATE "joint_account_transactions"
         SET "expense_category" = NULL
       WHERE "type" = 'disbursement'
         AND "settles_contributor_id" IS NOT NULL
         AND lower("expense_category") = 'not sure yet'
      RETURNING "id"`);
    // A payment to somebody you owe left under a fee category - M-Pesa or
    // Fuliza charges, or the category of its own fee. A payment is never its
    // own fee: a 40,000 payment changed to "Paying Optimum prime solutions Ltd"
    // stayed titled "M-Pesa charges" (8 Oct 2026). Fee rows themselves are
    // left alone.
    const chargeDebts = await db.execute(sql`
      UPDATE "joint_account_transactions" t
         SET "expense_category" = NULL
       WHERE t."type" = 'disbursement'
         AND t."settles_contributor_id" IS NOT NULL
         AND t."charge_for_transaction_id" IS NULL
         AND t."expense_category" IS NOT NULL
         AND (
           lower(btrim(t."expense_category")) IN ('m-pesa charges', 'fuliza charges')
           OR EXISTS (
             SELECT 1 FROM "joint_account_transactions" fee
              WHERE fee."charge_for_transaction_id" = t."id"
                AND lower(btrim(fee."expense_category")) = lower(btrim(t."expense_category"))
           )
         )
      RETURNING t."id"`);
    const count = (result: unknown) => (result as { rows?: unknown[] }).rows?.length ?? 0;
    logger.info({ markedBorrowed: count(marked), sourcesCleared: count(cleared), notSureDebtPayments: count(notSureDebts), feeCategoryDebtPayments: count(chargeDebts) }, "Borrowed money and repayments carry no income source; debt payments carry no Not sure yet or fee category");
  } catch (err) {
    logger.warn({ err }, "Could not clear income sources from borrowed money; will try again at the next start");
  }
}
