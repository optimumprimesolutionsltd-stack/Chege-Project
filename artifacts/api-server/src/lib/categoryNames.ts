const EXPENSE_CATEGORY_ALIASES: Record<string, string> = {
  rent: "Housing",
  accommodation: "Housing",
};

export function normalizeExpenseCategoryName(name: string): string {
  return name.trim().toLocaleLowerCase("en-US");
}

/**
 * Canonicalize legacy expense labels at the API boundary. This keeps new
 * expenses, split allocations, and joint-account disbursements aligned with
 * the Housing category after the data migration.
 */
export function canonicalExpenseCategoryName(name: string): string {
  const trimmed = name.trim();
  return EXPENSE_CATEGORY_ALIASES[normalizeExpenseCategoryName(trimmed)] ?? trimmed;
}
