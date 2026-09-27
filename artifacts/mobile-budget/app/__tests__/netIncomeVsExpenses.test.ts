import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const reports = readFileSync('app/(tabs)/reports.tsx', 'utf8');

// "Recorded funding" read as jargon, and two side-by-side chips still left
// the person to subtract them in their head to know how the month actually
// went. Renamed to Income, paired plainly with Expenses, and given a
// computed Net figure of its own.
describe('the Income vs Expenses comparison on Reports', () => {
  it('calls the income figure Income, not the old jargon', () => {
    expect(reports).toContain("Text style={[styles.progressStatLabel, { color: colors.mutedForeground }]}>Income<");
    expect(reports).not.toContain('Recorded funding');
  });

  it('pairs it with Expenses rather than the old Spending label', () => {
    expect(reports).toContain("Text style={[styles.progressStatLabel, { color: colors.mutedForeground }]}>Expenses<");
  });

  it('shows a computed net figure rather than leaving the subtraction to the reader', () => {
    expect(reports).toContain('const netIncomeVsExpenses = (incomeStreamReport?.totalFunding ?? 0) - totalSpent;');
    expect(reports).toContain('testID="reports-net-income-vs-expenses"');
    expect(reports).toContain("netIncomeVsExpenses >= 0 ? colors.primary : colors.destructive");
  });

  it('only shows the net figure once there is something to compare', () => {
    expect(reports).toContain('!progressLoading && !progressError && hasMonthlyActivity && (');
  });
});
