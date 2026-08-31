export function parseBudgetSummaryPeriod(query: { month?: unknown; year?: unknown }): { month: number; year: number } {
  const now = new Date();
  const monthValue = Number(query.month);
  const yearValue = Number(query.year);
  const month = Number.isInteger(monthValue) && monthValue >= 1 && monthValue <= 12
    ? monthValue
    : now.getMonth() + 1;
  const year = Number.isInteger(yearValue) && yearValue >= 2000 && yearValue <= 2200
    ? yearValue
    : now.getFullYear();
  return { month, year };
}
