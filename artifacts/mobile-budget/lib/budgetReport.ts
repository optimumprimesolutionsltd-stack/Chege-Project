/**
 * The sums behind the Budget report, kept out of the screen so they can be
 * checked on their own.
 *
 * Rows come from the category breakdown, where a heading already includes its
 * sub-categories. So totals add up the top-level rows only, and spending with
 * no budget behind it (isBudgeted false) comes as rows of its own.
 */

export type BudgetRow = {
  category: string;
  budgetAmount: number;
  spentAmount: number;
  remaining?: number;
  isBudgeted?: boolean;
  parentName?: string | null;
  /** A side hustle's cost: the business's, left out of the household's figures and listed apart. */
  isBusinessCost?: boolean;
};

/** How far over budget, or 0. A budget of 0 is "tracked, not judged", so never over. */
export const overBy = (row: BudgetRow): number =>
  row.budgetAmount > 0 ? Math.max(0, row.spentAmount - row.budgetAmount) : 0;

const biggestFirst = (a: BudgetRow, b: BudgetRow) => overBy(b) - overBy(a) || b.spentAmount - a.spentAmount;

/**
 * The household's rows: a side hustle's costs out, and out of the headings
 * they sit under too - a heading's figures include its sub-categories, so
 * leaving out only a cost's own row left it counted there (Stock under
 * "Shop", say). Reports' category list uses the same rule as this report.
 */
export function householdRows<T extends BudgetRow & { percentUsed?: number }>(allRows: readonly T[]): T[] {
  const businessUnder = new Map<string, { budget: number; spent: number }>();
  for (const row of allRows) {
    if (!row.isBusinessCost || !row.parentName || allRows.some((other) => other.parentName === row.category)) continue;
    const sum = businessUnder.get(row.parentName) ?? { budget: 0, spent: 0 };
    sum.budget += row.budgetAmount;
    sum.spent += row.spentAmount;
    businessUnder.set(row.parentName, sum);
  }
  return allRows
    .filter((row) => !row.isBusinessCost)
    .map((row) => {
      const inside = businessUnder.get(row.category);
      if (!inside) return row;
      const budgetAmount = row.budgetAmount - inside.budget;
      const spentAmount = row.spentAmount - inside.spent;
      return {
        ...row,
        budgetAmount,
        spentAmount,
        remaining: budgetAmount - spentAmount,
        ...(row.percentUsed !== undefined ? { percentUsed: budgetAmount > 0 ? Math.round((spentAmount / budgetAmount) * 1000) / 10 : 0 } : {}),
      };
    });
}

export function budgetReport(allRows: readonly BudgetRow[]) {
  // Business costs are the side hustles', already taken off their profit on
  // Business; the household's budget against actual leaves them out.
  const businessCosts = allRows
    .filter((row) => row.isBusinessCost && !allRows.some((other) => other.parentName === row.category))
    .sort((a, b) => b.spentAmount - a.spentAmount);
  const rows = householdRows(allRows);
  const budgeted = rows.filter((row) => row.isBudgeted !== false);
  const topLevel = budgeted.filter((row) => !row.parentName);
  const childrenOf = new Map<string, BudgetRow[]>();
  for (const row of budgeted) {
    if (!row.parentName) continue;
    childrenOf.set(row.parentName, [...(childrenOf.get(row.parentName) ?? []), row]);
  }
  for (const [name, children] of childrenOf) childrenOf.set(name, [...children].sort(biggestFirst));

  const unbudgeted = rows.filter((row) => row.isBudgeted === false && row.spentAmount > 0).sort((a, b) => b.spentAmount - a.spentAmount);

  // Every category that is over, headings and sub-categories alike - but a
  // heading only when none of its own sub-categories already says so, or one
  // overspend would be listed twice.
  const over = budgeted
    .filter((row) => overBy(row) > 0)
    .filter((row) => row.parentName || !(childrenOf.get(row.category) ?? []).some((child) => overBy(child) > 0))
    .sort(biggestFirst);

  const budget = topLevel.reduce((sum, row) => sum + row.budgetAmount, 0);
  const spentBudgeted = topLevel.reduce((sum, row) => sum + row.spentAmount, 0);
  const spentUnbudgeted = unbudgeted.reduce((sum, row) => sum + row.spentAmount, 0);
  const spent = spentBudgeted + spentUnbudgeted;

  return {
    topLevel: [...topLevel].sort(biggestFirst),
    childrenOf,
    unbudgeted,
    over,
    businessCosts,
    totals: {
      budget, spentBudgeted, spentUnbudgeted, spent, left: budget - spent,
      businessCosts: businessCosts.reduce((sum, row) => sum + row.spentAmount, 0),
    },
  };
}
