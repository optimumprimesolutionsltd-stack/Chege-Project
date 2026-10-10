import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { ownerBusinessReady } from "./owner-business-money";
import { entriesToSortReady, NOT_SURE_CATEGORY } from "./entries-to-sort";
import { reversalLinksReady } from "./reversal-links";

/**
 * Money to and from one of the person's own accounts, known by its number.
 *
 * "Money between a user's personal account to his other personal account or
 * business should have an automatic logic ... user needs not be asked" (10 Oct
 * 2026). An M-Pesa payment to a bank through its paybill names the account it
 * went to - "Equity Paybill Account (0870193430866)" - and once a bank account
 * in Jamvi carries that number, every new import files those payments as moves
 * by itself (phone lib/teachJamvi withOwnAccounts). This does the same for what
 * was saved BEFORE the number was known: each such entry still waiting (Not sure
 * yet, or money in with no source) becomes a move between the two accounts -
 * not spending, not income - the moment the number is added, on Bank or in Teach
 * Jamvi. Nothing the person filed themselves is touched.
 */

/** Long enough to be an account number rather than a short code (phone lib/teachJamvi ACCOUNT_DIGITS). */
export const ACCOUNT_DIGITS = 5;

/** The account number a description ends with, in brackets, as digits (phone lib/payeeLearning referenceOf). */
export const referenceDigits = (description: string): string =>
  description.match(/\(([^)]*)\)\s*$/)?.[1].replace(/\D/g, "") ?? "";

type Candidate = { id: number; type: string; amount: number; description: string; date: string; account_id: number };

/**
 * Turns every waiting entry to or from `accountNumber` into a move to the
 * account `accountId`. Returns the ids moved.
 */
export async function moveSavedToOwnAccount(groupId: number, accountId: number, accountNumber: string | null | undefined): Promise<number[]> {
  const digits = (accountNumber ?? "").replace(/\D/g, "");
  if (digits.length < ACCOUNT_DIGITS) return [];
  return db.transaction(async (trx) => {
    const found = await trx.execute(sql`
      SELECT t."id", t."type", t."amount", t."description", t."date"::text AS "date", t."account_id"
        FROM "joint_account_transactions" t
       WHERE t."group_id" = ${groupId}
         AND t."account_id" IS NOT NULL
         AND t."account_id" <> ${accountId}
         AND t."description" LIKE ${`%${digits}%`}
         AND t."bank_transfer_id" IS NULL
         AND t."savings_goal_id" IS NULL
         AND t."transfer_direction" IS NULL
         AND t."charge_for_transaction_id" IS NULL
         AND t."expense_id" IS NULL
         AND t."is_borrowing" = false
         AND t."is_lending" = false
         AND t."settles_contributor_id" IS NULL
         AND ((t."type" = 'disbursement' AND (t."expense_category" IS NULL OR t."expense_category" = ${NOT_SURE_CATEGORY}))
           OR (t."type" = 'deposit' AND t."income_source_id" IS NULL))
         AND NOT EXISTS (SELECT 1 FROM "debt_entry_links" d WHERE d."transaction_id" = t."id")
         AND NOT EXISTS (SELECT 1 FROM "joint_account_deposit_splits" s WHERE s."transaction_id" = t."id")
         ${ownerBusinessReady() ? sql`AND NOT EXISTS (SELECT 1 FROM "owner_business_money" o WHERE o."transaction_id" = t."id")` : sql``}
         ${reversalLinksReady()
           ? sql`AND NOT EXISTS (SELECT 1 FROM "reversal_links" r WHERE r."reversal_transaction_id" = t."id" OR r."original_transaction_id" = t."id")`
           : sql``}
       FOR UPDATE OF t`);
    const rows = (found.rows as Candidate[]).filter((row) => referenceDigits(row.description) === digits);
    const moved: number[] = [];
    for (const row of rows) {
      const id = Number(row.id);
      const transferId = randomUUID();
      // The saved entry stays as it is, now one half of the move; the other half is made on the account.
      await trx.execute(sql`
        UPDATE "joint_account_transactions"
           SET "bank_transfer_id" = ${transferId}, "bank_transfer_account_id" = ${accountId},
               "expense_category" = NULL, "income_source_id" = NULL
         WHERE "id" = ${id} AND "group_id" = ${groupId}`);
      await trx.execute(sql`
        INSERT INTO "joint_account_transactions"
          ("group_id", "account_id", "type", "amount", "description", "date", "bank_transfer_id", "bank_transfer_account_id")
        VALUES (${groupId}, ${accountId}, ${row.type === "disbursement" ? "deposit" : "disbursement"}, ${row.amount},
                ${row.description}, ${row.date}, ${transferId}, ${Number(row.account_id)})`);
      if (entriesToSortReady()) {
        await trx.execute(sql`DELETE FROM "entries_to_sort" WHERE "transaction_id" = ${id} AND "group_id" = ${groupId}`);
        await trx.execute(sql`DELETE FROM "entries_to_check" WHERE "transaction_id" = ${id} AND "group_id" = ${groupId}`);
      }
      moved.push(id);
    }
    return moved;
  });
}
