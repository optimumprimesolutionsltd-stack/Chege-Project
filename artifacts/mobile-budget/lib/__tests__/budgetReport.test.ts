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
    expect(budgetReport([]).totals).toEqual({ budget: 0, spentBudgeted: 0, spentUnbudgeted: 0, spent: 0, left: 0, businessCosts: 0 });
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

// "If it's counting cost of goods sold as actual then it's not true": a side
// hustle's costs are the business's, already off its profit on Business.
describe('side-hustle costs are not household spending', () => {
  const withBusiness = budgetReport([
    ...rows,
    { category: 'Stock', budgetAmount: 0, spentAmount: 165134, parentName: null, isBusinessCost: true },
    { category: 'Transport for side hustle', budgetAmount: 5000, spentAmount: 4258, parentName: null, isBusinessCost: true },
  ]);

  it('leaves them out of budget and actual', () => {
    expect(withBusiness.totals.budget).toBe(53000);
    expect(withBusiness.totals.spent).toBe(61500);
    expect(withBusiness.topLevel.map((row) => row.category)).not.toContain('Stock');
  });

  it('lists them apart, biggest first, with their total', () => {
    expect(withBusiness.businessCosts.map((row) => row.category)).toEqual(['Stock', 'Transport for side hustle']);
    expect(withBusiness.totals.businessCosts).toBe(169392);
  });

  it('never lists one as over budget', () => {
    expect(withBusiness.over.map((row) => row.category)).not.toContain('Transport for side hustle');
  });
});

describe('the Budget tab card', () => {
  const budget = readFileSync('app/(tabs)/budget.tsx', 'utf8');
  it('leaves side-hustle costs out of budget against actual, and says so', () => {
    expect(budget).toContain('const leafBreakdown = allLeaves.filter((category) => !category.isBusinessCost);');
    expect(budget).toContain('testID="budget-business-costs"');
  });
});

describe('All income', () => {
  const income = readFileSync('app/income-ledger.tsx', 'utf8');
  it('shows money back from reversed payments beside income, not in it', () => {
    expect(income).toContain('money back from reversed payments');
  });
});

describe('a side-hustle cost filed under a household heading', () => {
  // "Still not true": Stock sat under a heading, and the heading's own figure
  // - which includes its sub-categories - still carried Stock's spending.
  const report = budgetReport([
    { category: 'Shop', budgetAmount: 10000, spentAmount: 175134, parentName: null },
    { category: 'Stock', budgetAmount: 0, spentAmount: 165134, parentName: 'Shop', isBusinessCost: true },
    { category: 'Shop supplies', budgetAmount: 10000, spentAmount: 10000, parentName: 'Shop' },
    { category: 'Rent', budgetAmount: 25000, spentAmount: 25000, parentName: null },
  ]);

  it('comes out of the heading as well as its own row', () => {
    expect(report.topLevel.find((row) => row.category === 'Shop')).toMatchObject({ budgetAmount: 10000, spentAmount: 10000 });
    expect(report.totals).toMatchObject({ budget: 35000, spent: 35000, businessCosts: 165134 });
  });

  it('leaves the heading off the over-budget list once it is out', () => {
    expect(report.over).toEqual([]);
  });
});
