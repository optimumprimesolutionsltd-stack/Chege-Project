/**
 * Deliberately empty.
 *
 * It used to fold "rent" and "accommodation" into Housing, from an era when
 * categories were a flat list and the two names could only ever be duplicates
 * of each other. Subcategories changed that: Rent under Housing is a sensible
 * hierarchy, exactly like Groceries under Food, and the alias made it
 * impossible to build — creating "Rent" became "Housing", collided with the
 * Housing already there, and was refused.
 *
 * Folding also meant an expense tagged "Rent" was stored as "Housing", so the
 * subcategory could never have collected anything even if it existed.
 *
 * Kept as a map rather than deleted outright because the shape is the useful
 * part: if a true synonym ever needs folding, it goes here. A refinement of a
 * broader category never does.
 */
const EXPENSE_CATEGORY_ALIASES: Record<string, string> = {};

export function normalizeExpenseCategoryName(name: string): string {
  return name.trim().toLocaleLowerCase("en-US");
}

/**
 * Canonicalize a category label at the API boundary.
 *
 * Applied to expenses, split allocations and joint-account disbursements — and
 * to budget categories themselves, which it was not for a long time. That gap
 * did real damage: an expense tagged "Rent" is stored as "Housing", so a
 * category somebody created called "Rent" could never accumulate any spending.
 * It sat at zero while the money appeared under Housing, and the group ended
 * up holding two categories for one thing.
 *
 * Deliberately *not* the same list as onboarding's ONBOARDING_CATEGORY_ALIASES,
 * which also folds "groceries" into Food. That was right when categories were
 * a flat list, and is wrong now: Groceries is a subcategory of Food, and
 * folding it away here would make it impossible to create one. Only true
 * synonyms belong in this map — never a refinement of a broader category.
 */
export function canonicalExpenseCategoryName(name: string): string {
  const trimmed = name.trim();
  return EXPENSE_CATEGORY_ALIASES[normalizeExpenseCategoryName(trimmed)] ?? trimmed;
}
