/**
 * The budget as planned, from the category breakdown: each heading with the
 * sub-categories under it and what is budgeted, biggest first. A heading's
 * budget is its sub-categories added up (the breakdown already says so).
 * Spending with no budget ("Unbudgeted spending") is not part of a plan.
 */
export type PlanRow = {
  category: string;
  budgetAmount: number;
  isBudgeted?: boolean;
  parentName?: string | null;
  isBusinessCost?: boolean;
};

export type PlanHeading = { name: string; budget: number; business: boolean; children: Array<{ name: string; budget: number }> };

export function budgetPlan(rows: readonly PlanRow[]): { headings: PlanHeading[]; householdTotal: number; businessTotal: number } {
  const budgeted = rows.filter((row) => row.isBudgeted !== false);
  const headings = budgeted
    .filter((row) => !row.parentName)
    .map((row) => ({
      name: row.category,
      budget: row.budgetAmount,
      business: Boolean(row.isBusinessCost),
      children: budgeted
        .filter((child) => child.parentName === row.category)
        .map((child) => ({ name: child.category, budget: child.budgetAmount }))
        .sort((a, b) => b.budget - a.budget),
    }))
    .filter((heading) => heading.budget > 0 || heading.children.some((child) => child.budget > 0))
    // Household first, biggest first; side-hustle costs after, budgeted apart.
    .sort((a, b) => Number(a.business) - Number(b.business) || b.budget - a.budget);
  const sum = (list: PlanHeading[]) => list.reduce((total, heading) => total + heading.budget, 0);
  return {
    headings,
    householdTotal: sum(headings.filter((heading) => !heading.business)),
    businessTotal: sum(headings.filter((heading) => heading.business)),
  };
}
