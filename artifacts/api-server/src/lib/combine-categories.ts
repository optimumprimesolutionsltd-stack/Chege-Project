import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { isBuiltInCategoryName } from "./built-in-categories";
import { payeeRulesReady } from "./payee-rules";
import { reversalLinksReady } from "./reversal-links";

/**
 * One thing, one category. Onboarding used to offer "Shared bills" - Rent
 * share, Bills share, Shopping share - beside Housing, Utilities and Food, so
 * the same rent could be filed under Rent or Rent share and neither showed
 * what was left to pay ("rent share and rent are one and the same thing. i do
 * not want two categories", 13 Oct 2026).
 *
 * Combining moves everything filed under one category onto the other - entries,
 * split portions, bank and M-Pesa lines, the category a reversal puts back and
 * the payees Jamvi files there - then deletes it. The category kept keeps its
 * own budget; it takes the other's only when it had none, since the two were
 * budgeting the same money and adding them would count it twice. A heading
 * left with nothing under it goes too.
 *
 * The same sense as combining income streams (lib/combine-income-sources).
 */
export type CombineCategoriesResult =
  | { ok: true; moved: number; into: string }
  | { ok: false; status: 400 | 404; error: string };

type Row = { id: number; name: string; parent_id: number | null; budget_amount: number; children: number; parent_name: string | null };

export async function combineCategories(groupId: number, fromId: number, intoId: number): Promise<CombineCategoriesResult> {
  if (fromId === intoId) return { ok: false, status: 400, error: "Choose a different category to combine it into." };
  return db.transaction(async (trx) => {
    const found = await trx.execute(sql`
      SELECT c."id", c."name", c."parent_id", c."budget_amount",
             (SELECT count(*)::int FROM "budget_categories" k WHERE k."parent_id" = c."id") AS "children",
             (SELECT p."name" FROM "budget_categories" p WHERE p."id" = c."parent_id") AS "parent_name"
        FROM "budget_categories" c
       WHERE c."group_id" = ${groupId} AND c."id" IN (${fromId}, ${intoId})`);
    const rows = found.rows as Row[];
    const from = rows.find((row) => Number(row.id) === fromId);
    const into = rows.find((row) => Number(row.id) === intoId);
    if (!from || !into) return { ok: false as const, status: 404 as const, error: "Category not found" };
    if (isBuiltInCategoryName(from.name)) {
      return { ok: false as const, status: 400 as const, error: `${from.name} is built in: Jamvi files it there itself. Combine the other category into it instead.` };
    }
    // Entries are filed under subcategories; a heading only totals its children.
    if (Number(from.children) > 0 || Number(into.children) > 0) {
      return { ok: false as const, status: 400 as const, error: "Only categories with nothing under them can be combined. Combine the ones inside a heading one at a time." };
    }

    const moved = await trx.execute(sql`
      UPDATE "expenses" SET "category" = ${into.name}
       WHERE "group_id" = ${groupId} AND "category" = ${from.name}`);
    await trx.execute(sql`
      UPDATE "expense_category_allocations" SET "category" = ${into.name}
       WHERE "group_id" = ${groupId} AND "category" = ${from.name}`);
    await trx.execute(sql`
      UPDATE "joint_account_transactions" SET "expense_category" = ${into.name}
       WHERE "group_id" = ${groupId} AND "expense_category" = ${from.name}`);
    if (reversalLinksReady()) {
      await trx.execute(sql`
        UPDATE "reversal_links" SET "original_category" = ${into.name}
         WHERE "group_id" = ${groupId} AND "original_category" = ${from.name}`);
    }
    if (payeeRulesReady()) {
      // Payees filed under it ("jane wanjiku" -> "Rent share") now go to the one kept.
      // 'src:...' rules name income streams, never categories.
      await trx.execute(sql`
        UPDATE "payee_rules" SET "value" = ${into.name}, "updated_at" = now()
         WHERE "group_id" = ${groupId} AND "key" NOT LIKE 'src:%' AND "value" = ${from.name}`);
    }
    if (Number(into.budget_amount) <= 0 && Number(from.budget_amount) > 0) {
      await trx.execute(sql`
        UPDATE "budget_categories" SET "budget_amount" = ${Number(from.budget_amount)}
         WHERE "id" = ${intoId} AND "group_id" = ${groupId}`);
    }
    await trx.execute(sql`DELETE FROM "budget_categories" WHERE "id" = ${fromId} AND "group_id" = ${groupId}`);
    // "Shared bills" once its last subcategory has gone: an empty heading is
    // only something more to scroll past. Kept if anything is still filed under it.
    if (from.parent_id != null && Number(from.parent_id) !== Number(into.parent_id) && !isBuiltInCategoryName(from.parent_name)) {
      await trx.execute(sql`
        DELETE FROM "budget_categories" p
         WHERE p."id" = ${Number(from.parent_id)} AND p."group_id" = ${groupId}
           AND NOT EXISTS (SELECT 1 FROM "budget_categories" k WHERE k."parent_id" = p."id")
           AND NOT EXISTS (SELECT 1 FROM "expenses" e WHERE e."group_id" = ${groupId} AND e."category" = p."name")
           AND NOT EXISTS (SELECT 1 FROM "joint_account_transactions" t WHERE t."group_id" = ${groupId} AND t."expense_category" = p."name")`);
    }
    return { ok: true as const, moved: moved.rowCount ?? 0, into: into.name };
  });
}
