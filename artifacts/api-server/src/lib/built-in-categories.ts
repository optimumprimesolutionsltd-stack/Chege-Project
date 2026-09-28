import {
  db,
  budgetCategoriesTable,
  expensesTable,
  expenseCategoryAllocationsTable,
  jointAccountTxTable,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

/**
 * Categories every budget has, because the app itself files money into them.
 *
 * M-Pesa takes a transaction cost on most payments and Fuliza takes a daily fee
 * on every loan. Both were filed wherever somebody pointed a picker each time,
 * so they could not be followed, and a statement import stopped to ask. Now
 * there is one place for each, the same in every budget:
 *
 *   Transaction charges      (heading)
 *     M-Pesa charges         - M-Pesa's cost on payments and withdrawals
 *     Fuliza charges         - Fuliza's loan fees (see fulizaCharges in the import)
 *
 * The two are created with a budget of 0, which means tracked, not judged; a
 * budget can still be set. None of the three can be renamed, moved or deleted,
 * so an import always finds them and one month compares with the next.
 */

export const CHARGES_HEADING = "Transaction charges";
export const MPESA_CHARGES = "M-Pesa charges";
export const FULIZA_CHARGES = "Fuliza charges";

const BUILT_IN = [CHARGES_HEADING, MPESA_CHARGES, FULIZA_CHARGES];
const key = (name: string) => name.trim().toLowerCase();
const BUILT_IN_KEYS = new Set(BUILT_IN.map(key));

/**
 * Where budgets filed M-Pesa's charges before they were built in, most likely
 * first. "Transaction charges" is here too: a budget where somebody had already
 * renamed "Bank charges" to it has fees filed there, and a heading cannot hold
 * entries, so it becomes M-Pesa charges and the heading is made above it.
 */
const FORMER_NAMES = ["Transaction charges", "Bank charges"];

export function isBuiltInCategoryName(name: string | null | undefined): boolean {
  return name != null && BUILT_IN_KEYS.has(key(name));
}

/** What to say when somebody tries to rename, move or delete one. */
export const BUILT_IN_LOCKED_MESSAGE =
  "Transaction charges, M-Pesa charges and Fuliza charges are built in: Jamvi files fees there itself. You can set their budget, but not rename, move or delete them.";

type Row = { id: number; name: string; parentId: number | null; isArchived: boolean; hasChildren: boolean };

async function relevantRows(groupId: number): Promise<Row[]> {
  const names = [...new Set([...BUILT_IN, ...FORMER_NAMES].map(key))];
  const rows = await db
    .select({
      id: budgetCategoriesTable.id,
      name: budgetCategoriesTable.name,
      parentId: budgetCategoriesTable.parentId,
      isArchived: budgetCategoriesTable.isArchived,
      hasChildren: sql<boolean>`EXISTS (SELECT 1 FROM budget_categories child WHERE child.parent_id = ${budgetCategoriesTable.id})`,
    })
    .from(budgetCategoriesTable)
    .where(and(
      eq(budgetCategoriesTable.groupId, groupId),
      sql`lower(btrim(${budgetCategoriesTable.name})) IN (${sql.join(names.map((name) => sql`${name}`), sql`, `)})`,
    ));
  return rows.map((row) => ({ ...row, hasChildren: Boolean(row.hasChildren) }));
}

/** Rename a category and everything filed under its old name, as the category screen does. */
async function renameWithHistory(groupId: number, row: Row, to: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(budgetCategoriesTable)
      .set({ name: to })
      .where(and(eq(budgetCategoriesTable.id, row.id), eq(budgetCategoriesTable.groupId, groupId)));
    await tx.update(expensesTable)
      .set({ category: to })
      .where(and(eq(expensesTable.groupId, groupId), eq(expensesTable.category, row.name)));
    await tx.update(expenseCategoryAllocationsTable)
      .set({ category: to })
      .where(and(eq(expenseCategoryAllocationsTable.groupId, groupId), eq(expenseCategoryAllocationsTable.category, row.name)));
    await tx.update(jointAccountTxTable)
      .set({ expenseCategory: to })
      .where(and(eq(jointAccountTxTable.groupId, groupId), eq(jointAccountTxTable.expenseCategory, row.name)));
  });
}

/**
 * Make sure this budget has the heading and both charge categories under it.
 *
 * In order:
 *  1. No M-Pesa charges yet: the category already holding the fees - one called
 *     Transaction charges, or else Bank charges, with no sub-categories of its
 *     own - is renamed to it, taking every expense, split portion and bank
 *     entry filed under the old name along.
 *  2. The Transaction charges heading is made if missing.
 *  3. M-Pesa charges and Fuliza charges are made under it if missing; one of
 *     them sitting at the top level is moved under it, but one filed under a
 *     heading of the person's own is left where they put it.
 *  4. Any of the three that was archived is brought back.
 *
 * Adopts rather than duplicates, and is safe to run repeatedly and at the same
 * time: the unique name index settles a race.
 */
export async function ensureChargeCategories(groupId: number): Promise<void> {
  let rows = await relevantRows(groupId);
  const find = (name: string) => rows.find((row) => key(row.name) === key(name));
  const heading = () => find(CHARGES_HEADING);

  const complete = () => {
    const top = heading();
    return top && !top.isArchived && top.hasChildren
      && [MPESA_CHARGES, FULIZA_CHARGES].every((name) => {
        const row = find(name);
        return row && !row.isArchived;
      });
  };
  if (complete()) return;

  if (!find(MPESA_CHARGES)) {
    const former = FORMER_NAMES.map(find).find((row) => row && !row.hasChildren);
    if (former) {
      await renameWithHistory(groupId, former, MPESA_CHARGES);
      rows = await relevantRows(groupId);
    }
  }

  if (!heading()) {
    await db.insert(budgetCategoriesTable)
      .values({ groupId, name: CHARGES_HEADING, budgetAmount: 0 })
      .onConflictDoNothing();
    rows = await relevantRows(groupId);
  }
  const top = heading();
  if (!top) return;

  for (const name of [MPESA_CHARGES, FULIZA_CHARGES]) {
    const existing = find(name);
    if (!existing) {
      await db.insert(budgetCategoriesTable)
        .values({ groupId, name, budgetAmount: 0, parentId: top.id })
        .onConflictDoNothing();
    } else if (existing.parentId === null && existing.id !== top.id && !existing.hasChildren) {
      await db.update(budgetCategoriesTable)
        .set({ parentId: top.id })
        .where(and(eq(budgetCategoriesTable.id, existing.id), eq(budgetCategoriesTable.groupId, groupId)));
    }
  }

  // Built in means always there: an archived one is brought back.
  const archived = BUILT_IN.map(find).filter((row): row is Row => !!row && row.isArchived).map((row) => row.id);
  if (archived.length > 0) {
    await db.update(budgetCategoriesTable)
      .set({ isArchived: false })
      .where(and(eq(budgetCategoriesTable.groupId, groupId), inArray(budgetCategoriesTable.id, archived)));
  }
}
