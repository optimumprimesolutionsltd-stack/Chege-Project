import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// From the side-by-side check: the web had a 6-month spending trend, period
// totals and a contribution history that the phone did not.
describe('the phone has what the web shows on Reports and Contributions', () => {
  const reports = readFileSync('app/(tabs)/reports.tsx', 'utf8');

  it('shows the period totals for the range Reports is showing', () => {
    expect(reports).toContain('<PeriodTotalsCard');
    expect(reports).toMatch(/startDate=\{customDates \? orderedRange\(dayFrom, dayTo\)\[0\]/);
    expect(reports).toContain('isoDay(new Date(year, month, 0))');
    const card = readFileSync('components/PeriodTotalsCard.tsx', 'utf8');
    expect(card).toContain('useGetDashboardPeriodTotals');
    expect(card).toContain('borrowedTotal');
  });

  it('shows the 6-month spending trend', () => {
    expect(reports).toContain('<SpendingTrendCard />');
    expect(readFileSync('components/SpendingTrendCard.tsx', 'utf8')).toContain('useGetDashboardTrends(\n    { months: 6 }');
  });

  it('shows a shared group its contributions month by month', () => {
    const screen = readFileSync('app/(tabs)/contributions.tsx', 'utf8');
    const shared = screen.slice(screen.indexOf('{isSharedWorkspace ? ('), screen.indexOf('<ContributionExport />'));
    expect(shared).toContain('<ContributionHistory />');
    const history = readFileSync('components/ContributionHistory.tsx', 'utf8');
    expect(history).toContain('/api/dashboard/contribution-history?months=${months}');
    expect(history).toContain('const RANGES = [3, 6, 12] as const;');
  });
});
