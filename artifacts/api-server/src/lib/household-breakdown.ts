/**
 * The household's side of a category breakdown: a side hustle's costs (a
 * category linked to an income stream, like Stock) are the business's,
 * already taken off its profit on Business, so they come out.
 *
 * A heading's figures include its sub-categories, so a business cost filed
 * under a household heading is taken out of that heading too; leaving out only
 * its own row left it counted there. A heading that is itself a business cost
 * takes its sub-categories with it. The same rule as the phone's Budget report
 * (lib/budgetReport.ts there).
 */
export type BreakdownRowLike = {
  category: string;
  budgetAmount: number;
  spentAmount: number;
  remaining: number;
  percentUsed: number;
  parentName?: string | null;
  isBusinessCost?: boolean;
};

export function householdRows<T extends BreakdownRowLike>(rows: readonly T[]): T[] {
  const businessHeadings = new Set(rows.filter((row) => row.isBusinessCost).map((row) => row.category));
  const isBusiness = (row: T) => Boolean(row.isBusinessCost) || (row.parentName != null && businessHeadings.has(row.parentName));
  const takenOut = new Map<string, { budget: number; spent: number }>();
  for (const row of rows) {
    if (!isBusiness(row) || !row.parentName || businessHeadings.has(row.parentName)) continue;
    const sum = takenOut.get(row.parentName) ?? { budget: 0, spent: 0 };
    sum.budget += row.budgetAmount;
    sum.spent += row.spentAmount;
    takenOut.set(row.parentName, sum);
  }
  return rows
    .filter((row) => !isBusiness(row))
    .map((row) => {
      const inside = takenOut.get(row.category);
      if (!inside) return row;
      const budgetAmount = row.budgetAmount - inside.budget;
      const spentAmount = row.spentAmount - inside.spent;
      return {
        ...row,
        budgetAmount,
        spentAmount,
        remaining: budgetAmount - spentAmount,
        percentUsed: Math.round(budgetAmount > 0 ? (spentAmount / budgetAmount) * 1000 : 0) / 10,
      };
    });
}
