import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { incomeTotal, leftToPlan, planWith } from '@/lib/budgetTotals';

// "If I play around with the figures to fit my budget, I should see it without need of calculator."
describe('budget totals', () => {
  it('says what is left to plan, or how far over expected income', () => {
    expect(leftToPlan(300_000, 343_000)).toEqual({ text: 'KES 43,000 left to plan', over: false });
    expect(leftToPlan(350_000, 343_000)).toEqual({ text: 'KES 7,000 more than expected income', over: true });
    expect(leftToPlan(343_000, 343_000)).toEqual({ text: 'Every shilling of expected income is planned', over: false });
    expect(leftToPlan(100, 0)).toBeNull();
  });

  it('shows the plan with one figure changed as it is typed', () => {
    expect(planWith(300_000, 15_000, '20000')).toEqual({ total: 305_000, change: 5_000 });
    expect(planWith(300_000, 15_000, '10,000')).toEqual({ total: 295_000, change: -5_000 });
    expect(planWith(300_000, 0, '')).toEqual({ total: 300_000, change: 0 });
  });

  it('adds income up from the figures being typed, falling back to the saved ones', () => {
    const sources = [{ id: 1, expectedMonthlyAmount: 58_000 }, { id: 2, expectedMonthlyAmount: 30_000 }];
    expect(incomeTotal(sources)).toBe(88_000);
    expect(incomeTotal(sources, { 2: '35000' })).toBe(93_000);
    expect(incomeTotal(sources, { 2: 'abc' })).toBe(58_000);
  });

  it('is on the Budget tab: per person, overall, under the categories and while typing an amount', () => {
    const budget = readFileSync(join(__dirname, '..', '..', 'app', '(tabs)', 'budget.tsx'), 'utf8');
    expect(budget).toContain('testID={`income-total-${userId}`}');
    expect(budget).toContain('testID="income-grand-total"');
    expect(budget).toContain('testID="budget-categories-total"');
    expect(budget).toContain('testID="budget-plan-live"');
    expect(budget).toContain('const next = planWith(plannedHousehold, current, formAmount);');
  });
});
