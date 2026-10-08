import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { ownerBusinessReady } from "./owner-business-money";
import { entriesToSortReady, NOT_SURE_CATEGORY } from "./entries-to-sort";
import { reversalLinksReady } from "./reversal-links";

/** Marking and unmarking money between the owner and their business; what it means is in owner-business-money.ts. */

/**
 * Mark entries as money between the owner and their business. Only plain
 * entries of this budget: not a move between your own accounts or savings, a
 * fee, or a reversal. Returns the ids marked.
 */
export async function markOwnerBusiness(groupId: number, transactionIds: readonly number[]): Promise<number[]> {
  if (!ownerBusinessReady() || transactionIds.length === 0) return [];
  const ids = [...new Set(transactionIds)];
  return db.transaction(async (trx) => {
    const found = await trx.execute(sql`
      SELECT t."id", t."type" FROM "joint_account_transactions" t
       WHERE t."group_id" = ${groupId}
         AND t."id" IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
         AND t."bank_transfer_id" IS NULL
         AND t."savings_goal_id" IS NULL
         AND t."transfer_direction" IS NULL
         AND t."charge_for_transaction_id" IS NULL
         AND t."expense_id" IS NULL
         ${reversalLinksReady()
           ? sql`AND NOT EXISTS (SELECT 1 FROM "reversal_links" r WHERE r."reversal_transaction_id" = t."id" OR r."original_transaction_id" = t."id")`
           : sql``}`);
    const rows = found.rows as Array<{ id: number; type: string }>;
    const marked: number[] = [];
    for (const row of rows) {
      const id = Number(row.id);
      if (row.type === "deposit") {
        await trx.execute(sql`
          UPDATE "joint_account_transactions"
             SET "income_source_id" = NULL, "is_borrowing" = false, "settles_contributor_id" = NULL
           WHERE "id" = ${id} AND "group_id" = ${groupId}`);
      } else {
        await trx.execute(sql`
          UPDATE "joint_account_transactions"
             SET "expense_category" = NULL, "is_lending" = false, "settles_contributor_id" = NULL
           WHERE "id" = ${id} AND "group_id" = ${groupId}`);
      }
      await trx.execute(sql`DELETE FROM "debt_entry_links" WHERE "transaction_id" = ${id} AND "group_id" = ${groupId}`);
      if (entriesToSortReady()) {
        await trx.execute(sql`DELETE FROM "entries_to_sort" WHERE "transaction_id" = ${id} AND "group_id" = ${groupId}`);
        await trx.execute(sql`DELETE FROM "entries_to_check" WHERE "transaction_id" = ${id} AND "group_id" = ${groupId}`);
      }
      await trx.execute(sql`
        INSERT INTO "owner_business_money" ("transaction_id", "group_id") VALUES (${id}, ${groupId})
        ON CONFLICT ("transaction_id") DO NOTHING`);
      marked.push(id);
    }
    return marked;
  });
}

/**
 * Not money between the owner and their business after all: back to where an
 * unsorted entry is - money out under Not sure yet, money in with no source and
 * on the list to sort out.
 */
export async function unmarkOwnerBusiness(groupId: number, transactionId: number): Promise<boolean> {
  if (!ownerBusinessReady()) return false;
  return db.transaction(async (trx) => {
    const removed = await trx.execute(sql`
      DELETE FROM "owner_business_money" WHERE "transaction_id" = ${transactionId} AND "group_id" = ${groupId}
      RETURNING "transaction_id"`);
    if (removed.rows.length === 0) return false;
    const found = await trx.execute(sql`SELECT "type" FROM "joint_account_transactions" WHERE "id" = ${transactionId} AND "group_id" = ${groupId}`);
    const type = (found.rows[0] as { type?: string } | undefined)?.type;
    if (type === "disbursement") {
      await trx.execute(sql`
        UPDATE "joint_account_transactions" SET "expense_category" = ${NOT_SURE_CATEGORY}
         WHERE "id" = ${transactionId} AND "group_id" = ${groupId} AND "expense_category" IS NULL`);
    } else if (type === "deposit" && entriesToSortReady()) {
      await trx.execute(sql`
        INSERT INTO "entries_to_sort" ("transaction_id", "group_id") VALUES (${transactionId}, ${groupId})
        ON CONFLICT ("transaction_id") DO NOTHING`);
    }
    return true;
  });
}

export { ensureOwnerBusiness, isOwnerBusinessMoney, notOwnerBusinessMoney, ownerBusinessIds, ownerBusinessReady, setOwnerBusinessReadyForTests } from "./owner-business-money";
