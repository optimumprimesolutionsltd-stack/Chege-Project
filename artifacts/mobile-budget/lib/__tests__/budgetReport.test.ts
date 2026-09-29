import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { budgetReport, overBy, type BudgetRow } from '../budgetReport';

// A heading's row already includes its sub-categories, as the breakdown sends it.
const rows: BudgetRow[] = [
  { category: 'Food', budgetAmount: 20000, spentAmount: 23000, parentName: null },
  { category: 'Groceries', budgetAmount: 15000, spentAmount: 18500, parentName: 'Food' },
  { category: 'Milk & bread', budgetAmount: 5000, spentAmount: 4500, parentName: 'Food' },
  { category: 'Rent', budgetAmount: 25000, spentAmount: 25000, parentName: null },
  { category: 'Transport', budgetAmount: 8000, spentAmount: 9200, parentName: null },
  { category: 'Transaction charges', budgetAmount: 0, spentAmount: 1300, parentName: null },
  { category: 'M-Pesa charges', budgetAmount: 0, spentAmount: 612, parentName: 'Transaction charges' },
  { category: 'Fuliza charges', budgetAmount: 0, spentAmount: 688, parentName: 'Transaction charges' },
  { category: 'Gifts', budgetAmount: 0, spentAmount: 3000, isBudgeted: false, parentName: null },
];

describe('the budget report', () => {
  const report = budgetReport(rows);

  it('adds up the top-level rows only, so a heading is not counted with its sub-categories', () => {
    expect(report.totals.budget).toBe(53000);
    expect(report.totals.spentBudgeted).toBe(58500);
  });

  it('counts spending with no budget behind it in what was spent, and says how much', () => {
    expect(report.totals.spentUnbudgeted).toBe(3000);
    expect(report.totals.spent).toBe(61500);
    expect(report.totals.left).toBe(-8500);
    expect(report.unbudgeted.map((row) => row.category)).toEqual(['Gifts']);
  });

  it('lists what went over, biggest first, and a heading only when no sub-category already says so', () => {
    expect(report.over.map((row) => [row.category, overBy(row)])).toEqual([
      ['Groceries', 3500],
      ['Transport', 1200],
    ]);
  });

  it('never calls a tracked category - budget 0 - over budget', () => {
    expect(overBy({ category: 'Fuliza charges', budgetAmount: 0, spentAmount: 688 })).toBe(0);
  });

  it('puts overspends at the top of every list', () => {
    expect(report.topLevel.map((row) => row.category)).toEqual(['Food', 'Transport', 'Rent', 'Transaction charges']);
    expect(report.childrenOf.get('Food')!.map((row) => row.category)).toEqual(['Groceries', 'Milk & bread']);
  });

  it('is empty, not an error, for a month with nothing in it', () => {
    expect(budgetReport([]).totals).toEqual({ budget: 0, spentBudgeted: 0, spentUnbudgeted: 0, spent: 0, left: 0 });
  });
});

describe('on Reports', () => {
  const reports = readFileSync('app/(tabs)/reports.tsx', 'utf8');
  const layout = readFileSync('app/_layout.tsx', 'utf8');
  const screen = readFileSync('app/budget-report.tsx', 'utf8');

  it('sits with All income and All expenses', () => {
    expect(reports).toContain("router.push('/budget-report')");
    expect(reports.indexOf('testID="open-expense-ledger"')).toBeLessThan(reports.indexOf('testID="open-budget-report"'));
    expect(layout).toContain('<Stack.Screen name="budget-report"');
  });

  it('goes month by month, because budgets are monthly, and not into the future', () => {
    expect(screen).toContain('const params = { month, year };');
    expect(screen).toContain('disabled={isCurrentMonth}');
  });

  it('puts the month in the cache key', () => {
    expect(screen).toContain('queryKey: getGetDashboardCategoryBreakdownQueryKey(params)');
  });
});
