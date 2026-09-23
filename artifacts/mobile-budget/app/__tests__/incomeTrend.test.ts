import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const reports = readFileSync('app/(tabs)/reports.tsx', 'utf8');

// "How did this month go" was already answered by Income Streams. "Is this
// stream slipping" needs the same total against a row of months, which
// nothing on the Reports tab offered until now.
describe('the income trend, per stream over the last six months', () => {
  it('fetches six months by default, in the same cache key it is asked for', () => {
    expect(reports).toContain('useGetDashboardIncomeStreamsTrend(');
    expect(reports).toContain('{ months: 6 }');
    expect(reports).toContain('getGetDashboardIncomeStreamsTrendQueryKey({ months: 6 })');
  });

  it('refreshes alongside every other report figure on pull-to-refresh', () => {
    expect(reports).toContain('refetchExp(); refetchCat(); refetchSummary(); refetchIncomeStreams(); refetchIncomeTrend();');
  });

  it('is its own section, not folded into Income Streams', () => {
    expect(reports).toContain('testID="income-trend-section"');
    expect(reports).toContain("Income Trend");
  });

  it('keys each stream card by its income source, not by array position', () => {
    // Two streams have swapped positions before, once a month's totals moved
    // one ahead of the other — a key that survives that keeps React from
    // reusing the wrong card's local state.
    expect(reports).toContain("key={stream.incomeSourceId ?? 'unattributed'}");
    expect(reports).toContain("testID={`income-trend-stream-${stream.incomeSourceId ?? 'unattributed'}`}");
  });

  it('floors an empty month\'s bar instead of collapsing it to nothing', () => {
    // A zero-height bar reads as a rendering bug, not as "nothing that
    // month" — the same reasoning the daily spending trend already used.
    expect(reports).toContain('const barH = amount > 0 ? Math.max(6, Math.round((amount / max) * 72)) : 2;');
  });

  it('never divides by zero for a stream that has funded nothing at all', () => {
    expect(reports).toContain('const max = Math.max(1, ...stream.amounts);');
  });

  it('offers a retry when the trend fails to load', () => {
    expect(reports).toContain('testID="income-trend-retry"');
    expect(reports).toContain('onPress={() => refetchIncomeTrend()}');
  });
});
