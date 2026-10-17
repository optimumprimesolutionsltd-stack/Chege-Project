import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

// "Make the month to freeze here and in other parts of the app with same
// logic ... so i know which month i am dealing with when scrolling" (17 Oct 2026).
describe('the month stays in view while scrolling', () => {
  it('Business: above the scrolling page, and only accounts that moved that month', () => {
    const business = read('app/business.tsx');
    expect(business.indexOf('testID="business-month-bar"')).toBeLessThan(business.indexOf('<ScrollerScrollView'));
    expect(business).toContain('.filter((account) => account.moneyIn !== 0 || account.moneyOut !== 0)');
  });

  it('All income and All spending: above the list', () => {
    for (const [file, id] of [['app/income-ledger.tsx', 'income-ledger-month'], ['app/expense-ledger.tsx', 'expense-ledger-month']]) {
      const screen = read(file);
      expect(screen.indexOf(`testID="${id}-bar"`)).toBeLessThan(screen.indexOf('<ScrollerScrollView'));
    }
  });

  it('Budget: its own bar under the header, pinned once the header scrolls away', () => {
    const budget = read('app/(tabs)/budget.tsx');
    expect(budget).toContain('stickyHeaderIndices={[1]}');
    expect(budget).toContain('testID="budget-month-bar"');
  });

  it('Reports keeps it in the fixed header', () => {
    const reports = read('app/(tabs)/reports.tsx');
    expect(reports.indexOf('testID="reports-month"')).toBeLessThan(reports.indexOf('<PageScrollView'));
  });
});

describe('Sort them out', () => {
  it('stops soon after a swipe', () => {
    expect(read('app/sort-entries.tsx')).toContain('decelerationRate="fast"');
  });
});
