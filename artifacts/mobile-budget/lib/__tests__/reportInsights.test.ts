import { describe, expect, it } from 'vitest';
import { reportInsights, type InsightInput } from '@/lib/reportInsights';

const base: InsightInput = {
  current: [],
  previous: [],
  previousLabel: 'Sep',
  totalSpent: 0,
  totalBudget: 0,
  totalIncome: 0,
  dayOfMonth: null,
  daysInMonth: 31,
  monthEndLabel: '31 Oct',
};

// "Ensure user gets great insights from the reports" (8 Oct 2026).
describe('what stands out in a month', () => {
  it('says nothing about an empty month', () => {
    expect(reportInsights(base)).toEqual([]);
  });

  it('puts Not sure first, with its share, and sends you to sort it', () => {
    const [first] = reportInsights({ ...base, totalSpent: 594_764, current: [{ category: 'Not sure yet', spentAmount: 187_854 }, { category: 'School fees', spentAmount: 183_000 }] });
    expect(first.id).toBe('not-sure');
    expect(first.text).toBe('KES 187,854 (32%) of what you spent is still Not sure. Sort it out to see where your money really went.');
    expect(first.action).toEqual({ kind: 'sort' });
  });

  it('warns when the month is heading over budget', () => {
    const found = reportInsights({ ...base, totalSpent: 50_000, totalBudget: 100_000, dayOfMonth: 10, current: [{ category: 'Food', spentAmount: 50_000 }] });
    expect(found.find((insight) => insight.id === 'pace')?.text).toBe("At this pace you'll spend about KES 155,000 by 31 Oct, KES 55,000 over your budget.");
  });

  it('says how much of what came in was kept, or how much more went out', () => {
    expect(reportInsights({ ...base, totalSpent: 80_000, totalIncome: 100_000, current: [{ category: 'Food', spentAmount: 80_000 }] }).find((insight) => insight.id === 'kept')?.text)
      .toBe('You kept 20% of what came in: KES 20,000 of KES 100,000.');
    expect(reportInsights({ ...base, totalSpent: 120_000, totalIncome: 100_000, current: [{ category: 'Food', spentAmount: 120_000 }] }).find((insight) => insight.id === 'over-income')?.tone).toBe('warn');
  });

  it('names the biggest rise and fall on last month, ignoring small moves and Not sure', () => {
    const found = reportInsights({
      ...base,
      totalSpent: 30_000,
      current: [{ category: 'Food', spentAmount: 12_400 }, { category: 'Transport', spentAmount: 2_000 }, { category: 'Airtime', spentAmount: 1_100 }, { category: 'Not sure yet', spentAmount: 14_500 }],
      previous: [{ category: 'Food', spentAmount: 8_300 }, { category: 'Transport', spentAmount: 6_000 }, { category: 'Airtime', spentAmount: 1_000 }, { category: 'Not sure yet', spentAmount: 0 }],
    });
    expect(found.find((insight) => insight.id === 'rise')?.text).toBe('Food: KES 12,400, up KES 4,100 (+49%) on Sep.');
    expect(found.find((insight) => insight.id === 'fall')?.text).toBe('Transport: KES 2,000, down KES 4,000 (−67%) on Sep.');
  });

  it('adds up charges and fees, and names the biggest category', () => {
    const found = reportInsights({ ...base, totalSpent: 100_000, current: [{ category: 'M-Pesa charges', spentAmount: 2_210 }, { category: 'Fuliza charges', spentAmount: 1_000 }, { category: 'School fees', spentAmount: 31_000 }] });
    // School fees are not a charge.
    expect(found.find((insight) => insight.id === 'fees')?.text).toBe('You paid KES 3,210 in charges and fees.');
    expect(found.find((insight) => insight.id === 'top')?.text).toBe('School fees took 31% of everything you spent (KES 31,000).');
  });

  it('never shows more than five', () => {
    const found = reportInsights({
      ...base,
      totalSpent: 200_000, totalBudget: 100_000, totalIncome: 150_000, dayOfMonth: 10,
      current: [{ category: 'Not sure yet', spentAmount: 50_000 }, { category: 'Food', spentAmount: 60_000 }, { category: 'M-Pesa charges', spentAmount: 3_000 }, { category: 'Rent', spentAmount: 20_000 }],
      previous: [{ category: 'Food', spentAmount: 20_000 }, { category: 'Rent', spentAmount: 40_000 }],
    });
    expect(found).toHaveLength(5);
    expect(found[0].id).toBe('not-sure');
  });
});

describe('What stands out on Reports', () => {
  it('sits under How you are doing, compares with last month, and opens where to act', async () => {
    const { readFileSync } = await import('node:fs');
    const reports = readFileSync('app/(tabs)/reports.tsx', 'utf8');
    const card = readFileSync('components/InsightsCard.tsx', 'utf8');
    expect(reports.indexOf('<InsightsCard')).toBeGreaterThan(reports.indexOf('testID="monthly-progress-summary"'));
    expect(reports).toContain('const { data: previousBreakdown = [] } = useGetDashboardCategoryBreakdown(previousParams, live);');
    expect(card).toContain("if (insight.action.kind === 'sort') router.push('/sort-entries' as never);");
  });
});
