export interface CategoryRow {
  id: number;
  name: string;
  parentId: number | null;
}

export interface CategoryGroup {
  /** A top-level category — the only thing a simple form ever offers. */
  name: string;
  /** This parent's subcategories, in the order the API returned them. */
  children: string[];
}

const isOther = (row: CategoryRow) => row.name.trim().toLocaleLowerCase("en-US") === "other";

/**
 * Splits the flat category list the API returns into parents and their
 * subcategories, so a form can offer them in two stages: the category first,
 * then — in the detailed form only — an optional subcategory under it.
 *
 * "Other" is dropped throughout: it's the app's own sentinel for a one-off
 * expense, not something to offer as a category.
 *
 * Shared by the web forms and the phone's Log Expense picker, which have to
 * agree on what a category picker offers — the cross-client test in
 * family-budget/src/pages/expense-funding-entry.test.ts holds them to it.
 */
export function buildCategoryTree(categories: readonly CategoryRow[]): CategoryGroup[] {
  const byId = new Map(categories.map((row) => [row.id, row]));
  const notOther = (row: CategoryRow) => !isOther(row);
  const topLevel = categories.filter((row) => row.parentId === null || !byId.has(row.parentId)).filter(notOther);

  const groups: CategoryGroup[] = [];
  const placed = new Set<number>();
  for (const parent of topLevel) {
    const children = categories.filter((row) => row.parentId === parent.id).filter(notOther);
    groups.push({ name: parent.name, children: children.map((child) => child.name) });
    placed.add(parent.id);
    for (const child of children) placed.add(child.id);
  }
  // A child whose parent was filtered out above (e.g. the parent is "Other")
  // still needs to be selectable, on its own.
  for (const row of categories.filter(notOther)) {
    if (!placed.has(row.id)) groups.push({ name: row.name, children: [] });
  }
  return groups;
}

/**
 * The parent a category sits under, or `null` when it is itself top-level.
 * Lets a form keep the parent select showing while one of its subcategories
 * is the value actually being saved.
 */
export function parentOf(tree: readonly CategoryGroup[], name: string): string | null {
  const wanted = name.trim();
  if (!wanted) return null;
  return tree.find((group) => group.children.includes(wanted))?.name ?? null;
}

/**
 * The subcategories offered under whatever is currently selected — given
 * either the parent itself or one of its children, since the select keeps
 * showing the parent while a child is the saved value.
 */
export function childrenFor(tree: readonly CategoryGroup[], selected: string): string[] {
  const parent = parentOf(tree, selected) ?? selected.trim();
  return tree.find((group) => group.name === parent)?.children ?? [];
}

export interface BudgetRow {
  id: number;
  parentId: number | null;
  budgetAmount: number;
}

/**
 * The budget that actually counts for each category.
 *
 * A parent does not carry a budget of its own: it is the sum of its
 * subcategories. Giving Food 20,000 and then Groceries 8,000 under it was
 * asking the same question twice and counting the answer twice — the app's
 * total budget was the sum of every row, so the pair read as 28,000.
 *
 * A category with no subcategories keeps its own figure, which is every
 * category until somebody nests one.
 *
 * Operates on whatever list it is given, so a caller that has already narrowed
 * to one month gets a parent summed from that month's children rather than
 * from children that are not active.
 *
 * Nesting is one level deep — a subcategory cannot itself have subcategories —
 * so this does not recurse.
 */
export function effectiveBudgets(rows: readonly BudgetRow[]): Map<number, number> {
  const childrenTotal = new Map<number, number>();
  for (const row of rows) {
    if (row.parentId === null) continue;
    childrenTotal.set(row.parentId, (childrenTotal.get(row.parentId) ?? 0) + row.budgetAmount);
  }
  return new Map(rows.map((row) => [row.id, childrenTotal.get(row.id) ?? row.budgetAmount]));
}

/** True when this category's figure comes from its subcategories, not itself. */
export function hasChildren(rows: readonly BudgetRow[], id: number): boolean {
  return rows.some((row) => row.parentId === id);
}

/**
 * What the whole budget comes to, counting each category once.
 *
 * Summing every row double-counted a parent against its own children. Only
 * the rows that carry a figure of their own are added: a parent is already
 * the sum of the children counted here.
 */
export function totalBudget(rows: readonly BudgetRow[]): number {
  return rows
    .filter((row) => !hasChildren(rows, row.id))
    .reduce((sum, row) => sum + row.budgetAmount, 0);
}

/**
 * The part of a category tree that matches what someone typed, so a long list
 * can be narrowed as they type.
 *
 * A parent whose own name matches keeps all its subcategories (typing "food"
 * should show everything under Food); otherwise only the matching
 * subcategories stay, under their parent. Case and surrounding spaces are
 * ignored. An empty search returns the tree untouched.
 */
export function filterCategoryTree(tree: readonly CategoryGroup[], query: string): CategoryGroup[] {
  const needle = query.trim().toLocaleLowerCase("en-US");
  if (!needle) return tree as CategoryGroup[];
  const hit = (name: string) => name.toLocaleLowerCase("en-US").includes(needle);
  const out: CategoryGroup[] = [];
  for (const group of tree) {
    if (hit(group.name)) {
      out.push(group);
      continue;
    }
    const children = group.children.filter(hit);
    if (children.length > 0) out.push({ name: group.name, children });
  }
  return out;
}
