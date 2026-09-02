import { describe, expect, it } from 'vitest';
import { formatDisplayDate } from './displayFormat';

describe('formatDisplayDate', () => {
  it('formats ledger dates consistently', () => {
    expect(formatDisplayDate('2026-09-02')).toMatch(/^2 Sep(?:t)? 2026$/);
    expect(formatDisplayDate('2026-09-02T08:30:00.000Z')).toMatch(/^2 Sep(?:t)? 2026$/);
  });

  it('uses a clear fallback when no valid date exists', () => {
    expect(formatDisplayDate()).toBe('Date unavailable');
    expect(formatDisplayDate('not-a-date')).toBe('Date unavailable');
  });
});