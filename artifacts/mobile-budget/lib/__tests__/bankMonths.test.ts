import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { periodFor } from '@/lib/bankPeriod';

// "On the bank tab, i requested to see months here" (8 Oct 2026).
describe('Bank tab months', () => {
  it('a month is its whole calendar month, a year its whole year', () => {
    expect(periodFor('month:2026-02', '2026-10-08')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodFor('month:2024-02', '2026-10-08')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(periodFor('year:2025', '2026-10-08')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('offers All time, the year, Jan to Dec with counts, and Pick dates', () => {
    const bar = readFileSync('components/BankPeriodBar.tsx', 'utf8');
    expect(bar).toContain("{ value: 'all', label: 'All time' },");
    expect(bar).toContain('...months.map((month) => ({ value: `month:${month.key}` as PeriodPreset, label: month.label, count: month.count })),');
    expect(bar).toContain("{ value: 'custom', label: 'Pick dates' },");
    expect(bar).toContain('testID="bank-period-year"');
    expect(readFileSync('app/(tabs)/bank.tsx', 'utf8')).toContain('entries={data?.transactions ?? []}');
  });
});

// "Not yet sorted" (8 Oct 2026): money in with no source says Not sure on Bank.
describe('money in with no source on Bank', () => {
  it('is tagged Not sure, and the tag opens Sort them out', () => {
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain('testID={`bank-not-sure-${item.id}`}');
    expect(bank).toContain("onPress={() => router.push('/sort-entries' as never)}");
    expect(bank).toContain('{dep && !isSharedWorkspace && !item.incomeSourceId');
  });
});
