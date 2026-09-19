const EXPENSE_CATEGORY_ALIASES: Record<string, string> = {
  rent: "Housing",
  accommodation: "Housing",
};

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
