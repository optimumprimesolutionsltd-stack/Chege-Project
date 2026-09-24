import { nairobiNow } from "./nairobiTime";
export function parseBudgetSummaryPeriod(query: { month?: unknown; year?: unknown }): { month: number; year: number } {
  const now = nairobiNow();
  const monthValue = Number(query.month);
  const yearValue = Number(query.year);
  const month = Number.isInteger(monthValue) && monthValue >= 1 && monthValue <= 12
    ? monthValue
    : now.getUTCMonth() + 1;
  const year = Number.isInteger(yearValue) && yearValue >= 2000 && yearValue <= 2200
    ? yearValue
    : now.getUTCFullYear();
  return { month, year };
}
