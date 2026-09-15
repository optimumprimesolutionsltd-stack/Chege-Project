import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isoDay, monthStartIso, orderedRange } from '../dayRange';

describe('isoDay', () => {
  it('uses the local calendar day, not the UTC one', () => {
    // Late evening east of UTC, and early morning west of it, are the two
    // cases where a UTC-built string names the wrong day. Whatever this
    // machine's zone, the parts must match the date the person sees.
    const date = new Date(2026, 8, 15, 23, 30);
    expect(isoDay(date)).toBe('2026-09-15');
    expect(isoDay(new Date(2026, 0, 1, 0, 15))).toBe('2026-01-01');
  });

  it('pads single-digit months and days', () => {
    expect(isoDay(new Date(2026, 2, 5))).toBe('2026-03-05');
  });
});

describe('monthStartIso', () => {
  it('is the first of the current month', () => {
    expect(monthStartIso()).toMatch(/^\d{4}-\d{2}-01$/);
    const now = new Date();
    expect(monthStartIso().slice(0, 7))
      .toBe(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  });
});

describe('orderedRange', () => {
  it('leaves a forward range alone', () => {
    expect(orderedRange('2026-09-01', '2026-09-14')).toEqual(['2026-09-01', '2026-09-14']);
  });

  it('turns a backwards range around rather than sending an empty span', () => {
    expect(orderedRange('2026-09-14', '2026-09-01')).toEqual(['2026-09-01', '2026-09-14']);
  });

  it('handles both ends on the same day', () => {
    expect(orderedRange('2026-09-15', '2026-09-15')).toEqual(['2026-09-15', '2026-09-15']);
  });
});

describe('the Reports export sends the range it shows', () => {
  const reports = readFileSync('app/(tabs)/reports.tsx', 'utf8');

  it('only sends from and to when exact dates are switched on', () => {
    expect(reports).toContain("customDates ? { month, year, from: rangeFrom, to: rangeTo } : { month, year }");
  });

  it('orders the ends before sending them, so a backwards pick still works', () => {
    expect(reports).toContain('const [rangeFrom, rangeTo] = orderedRange(dayFrom, dayTo);');
  });

  it('names the file after the range rather than a month it does not cover', () => {
    expect(reports).toContain('`jamvi-report-${fileFrom}-to-${fileTo}.pdf`');
  });

  it('re-exports when the dates change, not only when the month does', () => {
    expect(reports).toContain('}, [month, year, customDates, dayFrom, dayTo]);');
  });
});
