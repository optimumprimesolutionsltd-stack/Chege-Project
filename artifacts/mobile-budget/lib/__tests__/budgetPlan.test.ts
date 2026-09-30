import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { budgetPlan } from '../budgetPlan';

// "On the reports I would like a plain budget report that shows what we have
// budgeted for, with a downloadable PDF too."
describe('the budget plan', () => {
  const rows = [
    { category: 'Food', budgetAmount: 20000, parentName: null },
    { category: 'Groceries', budgetAmount: 15000, parentName: 'Food' },
    { category: 'Eating out', budgetAmount: 5000, parentName: 'Food' },
    { category: 'Rent', budgetAmount: 25000, parentName: null },
    { category: 'Stock', budgetAmount: 50000, parentName: null, isBusinessCost: true },
    { category: 'Gifts', budgetAmount: 0, parentName: null },
    { category: 'Unbudgeted spending', budgetAmount: 0, parentName: null, isBudgeted: false },
  ];

  it('lists each heading with what is under it, household first and side-hustle costs apart', () => {
    const plan = budgetPlan(rows);
    expect(plan.headings.map((heading) => heading.name)).toEqual(['Rent', 'Food', 'Stock']);
    expect(plan.headings[1].children).toEqual([{ name: 'Groceries', budget: 15000 }, { name: 'Eating out', budget: 5000 }]);
    expect(plan.householdTotal).toBe(45000);
    expect(plan.businessTotal).toBe(50000);
  });

  it('is on Reports, with a PDF of the plan alone', () => {
    const reports = readFileSync('app/(tabs)/reports.tsx', 'utf8');
    const screen = readFileSync('app/budget-plan.tsx', 'utf8');
    expect(reports).toContain("router.push('/budget-plan')");
    expect(screen).toContain('includeSummary: false, includeBudget: false, includeIncome: false, includeBudgetPlan: true');
  });
});

// "All expenses: I can't export by category."
describe('the All expenses PDF', () => {
  it('follows the view: by category or by item, each with its subtotal', () => {
    const ledger = readFileSync('app/expense-ledger.tsx', 'utf8');
    expect(ledger).toContain("...(view !== 'date' ? { expensesGroupBy: view } : {}),");
  });
});
