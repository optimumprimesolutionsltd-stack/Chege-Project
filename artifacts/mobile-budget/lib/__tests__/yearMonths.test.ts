import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monthsOfYear, yearsOf } from '@/lib/yearMonths';
import { isResumable } from '@/lib/resumeAfterUpdate';

// "Can we have months jan - dec" (8 Oct 2026).
const entries = [{ date: '2026-05-03' }, { date: '2026-05-20' }, { date: '2026-08-01' }, { date: '2025-12-30' }, { date: null }];

describe('Sort them out months', () => {
  it('are January to December, every month with its count', () => {
    const months = monthsOfYear(entries, 2026);
    expect(months.map((month) => month.label)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
    expect(months.find((month) => month.label === 'May')).toEqual({ key: '2026-05', label: 'May', count: 2 });
    expect(months.find((month) => month.label === 'Jan')?.count).toBe(0);
  });

  it('offer every year the entries span, and this one', () => {
    expect(yearsOf(entries, 2026)).toEqual([2025, 2026]);
    expect(yearsOf([], 2026)).toEqual([2026]);
  });

  it('are always shown, with a year switch when there is more than one year', () => {
    const screen = readFileSync('app/sort-entries.tsx', 'utf8');
    expect(screen).toContain('const months = useMemo(() => monthsOfYear(entries, year), [entries, year]);');
    expect(screen).toContain('testID="sort-entries-year"');
  });
});

// "When a new update comes in and I accept I get removed from what I was doing" (8 Oct 2026).
describe('an update returns to the list being worked through', () => {
  it('for Sort them out, Possible duplicates and Find the difference', () => {
    expect(isResumable('/sort-entries')).toBe(true);
    expect(isResumable('/possible-duplicates')).toBe(true);
    expect(isResumable('/mpesa-difference')).toBe(true);
  });
});

// "Want all time, months and pick a date" (8 Oct 2026).
describe('Sort them out: all time, a month, or dates picked', () => {
  const screen = readFileSync('app/sort-entries.tsx', 'utf8');
  it('offers All time first and Pick dates last', () => {
    expect(screen).toContain("{ key: null as string | null, label: 'All time', count: entries.length }, ...months, { key: 'range', label: 'Pick dates'");
  });
  it('filters by the days picked, either order', () => {
    expect(screen).toContain("const [rangeFrom, rangeTo] = orderedRange(range.from, range.to);");
    expect(screen).toContain("month === 'range' ? entry.date.slice(0, 10) >= rangeFrom && entry.date.slice(0, 10) <= rangeTo : inMonth(entry, month)");
    expect(screen).toContain('testID="sort-entries-dates"');
  });
});
