import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monthRange, stepMonth, wholeMonthOf } from '../dayRange';

const today = '2026-10-01';

describe('monthRange', () => {
  it('runs a past month from its 1st to its last day', () => {
    expect(monthRange(2026, 9, today)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(monthRange(2024, 2, today)).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });

  it('stops the current month at today', () => {
    expect(monthRange(2026, 10, today)).toEqual({ from: '2026-10-01', to: '2026-10-01' });
  });

  it('rolls across the year', () => {
    expect(monthRange(2026, 0, today)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(monthRange(2025, 13, today)).toEqual({ from: '2026-01-01', to: '2026-01-31' });
  });
});

describe('wholeMonthOf', () => {
  it('names a range that is exactly one month', () => {
    expect(wholeMonthOf('2026-09-01', '2026-09-30', today)).toEqual({ year: 2026, month: 9 });
    expect(wholeMonthOf('2026-10-01', '2026-10-01', today)).toEqual({ year: 2026, month: 10 });
  });

  it('calls anything else custom', () => {
    expect(wholeMonthOf('2026-09-02', '2026-09-30', today)).toBeNull();
    expect(wholeMonthOf('2026-09-01', '2026-09-29', today)).toBeNull();
    expect(wholeMonthOf('2025-10-01', '2026-10-01', today)).toBeNull();
  });
});

describe('stepMonth', () => {
  it('moves from the month the range starts in', () => {
    expect(stepMonth('2026-10-01', -1, today)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(stepMonth('2026-01-15', -1, today)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(stepMonth('2026-08-01', 1, today)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });
});

describe('the month stepper sits above every From/To pair', () => {
  it.each([
    ['app/income-ledger.tsx', 'income-ledger-month'],
    ['app/expense-ledger.tsx', 'expense-ledger-month'],
    ['app/spending-by-item.tsx', 'spending-item-month'],
    ['app/(tabs)/reports.tsx', 'reports-month'],
    ['components/ContributionExport.tsx', 'contribution-export-month'],
    ['components/ContributionVariance.tsx', 'contribution-variance-month'],
    ['app/bank-statement.tsx', 'statement-month'],
  ])('%s', (path, testID) => {
    const source = readFileSync(path, 'utf8');
    expect(source).toContain("import { MonthStepper } from '@/components/MonthStepper';");
    expect(source).toContain(`testID="${testID}"`);
  });
});
