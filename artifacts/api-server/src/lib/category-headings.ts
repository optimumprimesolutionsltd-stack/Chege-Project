/**
 * Where money may not land.
 *
 * A category with subcategories is a heading, not a destination: its budget is
 * its subcategories added up, and its spending is theirs too. Money sitting
 * directly on it would go into a figure that is supposed to be a total of the
 * rows beneath it, so the two could never agree again.
 *
 * This lives here rather than beside one route because spending reaches the
 * same category totals through two doors — an expense, and a bank
 * disbursement carrying a category. The rule was enforced on the expense route
 * alone, so the bank was a way straight around it, and the bank is the door
 * that M-Pesa parsing will eventually feed. Two copies of a rule is two
 * chances for them to drift; one module with three callers is not.
 */
import { db, budgetCategoriesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { normalizeExpenseCategoryName } from "./categoryNames";

/**
 * The categories in this group that hold subcategories, keyed by normalized
 * name because both doors reference a category by name rather than by id.
 */
export async function headingNames(groupId: number): Promise<Map<string, string>> {
  const rows = await db
    .select({ name: budgetCategoriesTable.name })
    .from(budgetCategoriesTable)
    .where(sql`${budgetCategoriesTable.groupId} = ${groupId} AND EXISTS (
      SELECT 1 FROM budget_categories child
      WHERE child.parent_id = ${budgetCategoriesTable.id}
        AND child.group_id = ${groupId}
    )`);
  // A row without a usable name cannot be a heading. The column is NOT NULL,
  // so this never fires against a real database — it keeps the helper total
  // rather than throwing on a shape it did not expect.
  return new Map(
    rows
      .filter((row): row is { name: string } => typeof row.name === "string" && row.name.trim().length > 0)
      .map((row) => [normalizeExpenseCategoryName(row.name), row.name]),
  );
}

/** What to say when somebody aims money at a heading. */
export function postingToHeadingError(name: string): string {
  return `"${name}" has subcategories, so spending goes on one of them rather than on "${name}" itself. Choose a subcategory.`;
}

/**
 * The heading among these names, if any. Returns the category's real spelling
 * so the message can name it the way the person wrote it.
 *
 * Costs a query, so callers run it only once a request is otherwise valid: a
 * malformed body is still rejected without touching the database.
 */
export async function headingAmong(groupId: number, names: Array<string | null | undefined>): Promise<string | null> {
  const wanted = names
    .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
    .map(normalizeExpenseCategoryName);
  if (wanted.length === 0) return null;

  const headings = await headingNames(groupId);
  for (const name of wanted) {
    const heading = headings.get(name);
    if (heading) return heading;
  }
  return null;
}
