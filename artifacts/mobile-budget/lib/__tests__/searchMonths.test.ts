import { describe, expect, it } from 'vitest';
import { byMonth, monthKeyOf, monthLabel, monthsFound, sectionsByMonth } from '@/lib/searchMonths';

// "Can we have months here too" - Search, 8 Oct 2026.
describe('search results by month', () => {
  const found = [
    { kind: 'bank', amount: 100, direction: 'out' as const, date: '2026-10-06' },
    { kind: 'bank', amount: 10115, direction: 'out' as const, date: '2026-10-05T09:00:00Z' },
    { kind: 'bank', amount: 108, direction: 'out' as const, date: '2026-09-28' },
    { kind: 'income', amount: 3000, date: '2026-09-02' },
    { kind: 'expenses', amount: 500, date: '2025-12-31' },
    { kind: 'goals', amount: 10000, date: null },
  ];

  it('reads the month from a date or a timestamp; goals have none', () => {
    expect(monthKeyOf(found[1])).toBe('2026-10');
    expect(monthKeyOf(found[5])).toBeNull();
    expect(monthKeyOf({ date: 'garbage' })).toBeNull();
  });

  it('lists the months found, newest first, across a year end', () => {
    expect(monthsFound(found)).toEqual(['2026-10', '2026-09', '2025-12']);
  });

  it('narrows to one month, or keeps everything', () => {
    expect(byMonth(found, '2026-09').map((r) => r.amount)).toEqual([108, 3000]);
    expect(byMonth(found, 'all')).toHaveLength(6);
  });

  it('splits into month sections with their own totals; no-date last', () => {
    const sections = sectionsByMonth(found);
    expect(sections.map((s) => s.key)).toEqual(['2026-10', '2026-09', '2025-12', 'none']);
    expect(sections[0].totals).toEqual({ count: 2, in: 0, out: 10215 });
    expect(sections[1].totals).toEqual({ count: 2, in: 3000, out: 108 });
    expect(sections[3].title).toBe('No date');
  });

  it('puts the newest entry first inside a month', () => {
    const shuffled = [found[1], found[0]];
    expect(sectionsByMonth(shuffled)[0].data.map((r) => r.amount)).toEqual([100, 10115]);
  });

  it('names months in words', () => {
    expect(monthLabel('2026-10')).toMatch(/Oct/);
    expect(monthLabel('2026-10', { long: true })).toMatch(/October 2026/);
  });
});
