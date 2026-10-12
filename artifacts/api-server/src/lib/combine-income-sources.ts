import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { businessStreamsReady } from "./business-streams";
import { businessAccountsReady } from "./business-accounts";
import { entriesToSortReady } from "./entries-to-sort";
import { payeeRulesReady } from "./payee-rules";
import { ownerBusinessReady } from "./owner-business-money";

/**
 * One source of money, one income stream. Onboarding used to make two for the
 * same money - "Rental income" picked from the list and "Dahanak Ventures"
 * typed as a business - so rent could be counted under either, or twice
 * ("dahanak ventures and rental income are one and the same thing. why cant
 * we combine them", "this problem came from onboarding", 11 Oct 2026).
 *
 * Combining moves everything that names the stream onto the business - money
 * in, money spent from it, splits, cost categories, business bank accounts,
 * entries waiting to be checked and the payers Jamvi remembers for it - then
 * deletes the stream. Its own monthly expectations go with it: the business
 * keeps its own.
 */
export type CombineResult =
  | { ok: true; moved: number }
  | { ok: false; status: 400 | 404 | 503; error: string };

export async function combineIncomeSources(groupId: number, fromId: number, intoId: number): Promise<CombineResult> {
  if (fromId === intoId) return { ok: false, status: 400, error: "Choose a different business to combine it into." };
  if (!businessStreamsReady()) return { ok: false, status: 503, error: "Businesses cannot be changed yet. Try again in a minute." };
  return db.transaction(async (trx) => {
    const found = await trx.execute(sql`
      SELECT s."id", (b."income_source_id" IS NOT NULL) AS "business"
        FROM "income_sources" s
        LEFT JOIN "business_streams" b ON b."income_source_id" = s."id"
       WHERE s."group_id" = ${groupId} AND s."id" IN (${fromId}, ${intoId})`);
    const rows = found.rows as Array<{ id: number; business: boolean }>;
    const from = rows.find((row) => Number(row.id) === fromId);
    const into = rows.find((row) => Number(row.id) === intoId);
    if (!from || !into) return { ok: false as const, status: 404 as const, error: "Income stream not found" };
    if (!into.business) return { ok: false as const, status: 400 as const, error: "Money can only be combined into one of your businesses." };
    if (from.business) return { ok: false as const, status: 400 as const, error: "That is a business of its own. Choose an income stream that is not one." };

    const moved = await trx.execute(sql`
      UPDATE "joint_account_transactions" SET "income_source_id" = ${intoId}
       WHERE "income_source_id" = ${fromId} AND "group_id" = ${groupId}`);
    await trx.execute(sql`UPDATE "joint_account_deposit_splits" SET "income_source_id" = ${intoId} WHERE "income_source_id" = ${fromId}`);
    await trx.execute(sql`UPDATE "expenses" SET "income_source_id" = ${intoId} WHERE "income_source_id" = ${fromId}`);
    await trx.execute(sql`UPDATE "expense_income_splits" SET "income_source_id" = ${intoId} WHERE "income_source_id" = ${fromId}`);
    await trx.execute(sql`UPDATE "budget_categories" SET "reduces_income_source_id" = ${intoId} WHERE "reduces_income_source_id" = ${fromId}`);
    if (businessAccountsReady()) {
      await trx.execute(sql`UPDATE "business_bank_accounts" SET "income_source_id" = ${intoId} WHERE "income_source_id" = ${fromId}`);
    }
    if (ownerBusinessReady()) {
      await trx.execute(sql`UPDATE "owner_business_money" SET "income_source_id" = ${intoId} WHERE "income_source_id" = ${fromId} AND "group_id" = ${groupId}`);
    }
    if (entriesToSortReady()) {
      await trx.execute(sql`UPDATE "entries_to_check" SET "income_source_id" = ${intoId} WHERE "income_source_id" = ${fromId} AND "group_id" = ${groupId}`);
    }
    if (payeeRulesReady()) {
      // Payers remembered for the stream ('src:...' rules) now go to the business.
      await trx.execute(sql`
        UPDATE "payee_rules" SET "value" = ${String(intoId)}, "updated_at" = now()
         WHERE "group_id" = ${groupId} AND "key" LIKE 'src:%' AND "value" = ${String(fromId)}`);
    }
    await trx.execute(sql`DELETE FROM "income_sources" WHERE "id" = ${fromId} AND "group_id" = ${groupId}`);
    return { ok: true as const, moved: moved.rowCount ?? 0 };
  });
}
