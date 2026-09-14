export interface CategoryRow {
  id: number;
  name: string;
  parentId: number | null;
}

export interface CategoryPickerEntry {
  /** The actual selectable value — never the composite label. */
  name: string;
  /** What the chip displays: "Parent: Child" for a subcategory, else just the name. */
  label: string;
}

/**
 * Orders categories for a picker so each parent is immediately followed by
 * its own subcategories, and labels a subcategory's chip with its parent's
 * name — the only way that relationship is visible at the moment an expense
 * is actually logged, since the API returns every category flat.
 *
 * "Other" is dropped throughout: it's the app's own sentinel for an
 * unspecified category, not something to offer as a choice.
 */
export function groupCategoriesForPicker(categories: readonly CategoryRow[]): CategoryPickerEntry[] {
  const byId = new Map(categories.map((row) => [row.id, row]));
  const notOther = (row: CategoryRow) => row.name.trim().toLocaleLowerCase("en-US") !== "other";
  const topLevel = categories.filter((row) => row.parentId === null || !byId.has(row.parentId)).filter(notOther);

  const ordered: CategoryPickerEntry[] = [];
  const placed = new Set<number>();
  for (const parent of topLevel) {
    ordered.push({ name: parent.name, label: parent.name });
    placed.add(parent.id);
    for (const child of categories.filter((row) => row.parentId === parent.id).filter(notOther)) {
      ordered.push({ name: child.name, label: `${parent.name}: ${child.name}` });
      placed.add(child.id);
    }
  }
  // A child whose parent was filtered out above (e.g. the parent is "Other")
  // still needs to be selectable, on its own.
  for (const row of categories.filter(notOther)) {
    if (!placed.has(row.id)) ordered.push({ name: row.name, label: row.name });
  }
  return ordered;
}
