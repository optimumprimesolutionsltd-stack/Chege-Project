export interface CategoryRow {
  id: number;
  name: string;
  parentId: number | null;
}

export interface CategoryPickerGroup {
  /** A top-level category — the only thing Quick mode ever offers. */
  name: string;
  /** This parent's subcategories, in the order the API returned them. */
  children: string[];
}

const isOther = (row: CategoryRow) => row.name.trim().toLocaleLowerCase("en-US") === "other";

/**
 * Splits the flat category list the API returns into parents and their
 * subcategories, so the picker can offer them in two stages: the category
 * first, then — in Detailed mode only — an optional subcategory under it.
 *
 * "Other" is dropped throughout: it's the app's own sentinel for a one-off
 * expense, not something to offer as a category.
 */
export function buildCategoryTree(categories: readonly CategoryRow[]): CategoryPickerGroup[] {
  const byId = new Map(categories.map((row) => [row.id, row]));
  const notOther = (row: CategoryRow) => !isOther(row);
  const topLevel = categories.filter((row) => row.parentId === null || !byId.has(row.parentId)).filter(notOther);

  const groups: CategoryPickerGroup[] = [];
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
 * Lets the form keep a parent chip selected while one of its subcategories
 * is the value actually being saved.
 */
export function parentOf(tree: readonly CategoryPickerGroup[], name: string): string | null {
  const wanted = name.trim();
  if (!wanted) return null;
  return tree.find((group) => group.children.includes(wanted))?.name ?? null;
}
