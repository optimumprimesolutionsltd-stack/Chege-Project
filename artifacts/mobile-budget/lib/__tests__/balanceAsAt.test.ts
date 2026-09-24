import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { balanceAsAt } from '../balanceAsAt';

const account = {
  openingBalance: 1000,
  balance: 1000 + 500 - 200 + 300,
  transactions: [
    { type: 'deposit', amount: 500, date: '2026-09-01' },
    { type: 'disbursement', amount: 200, date: '2026-09-02' },
    { type: 'deposit', amount: 300, date: '2026-09-05T08:00:00.000Z' },
  ],
};

// Reported with screenshots: changing the Date on "A day of banking" left both
// balances exactly where they were.
describe('the balance follows the date chosen', () => {
  it('is the opening balance before anything was posted', () => {
    expect(balanceAsAt(account, '2026-08-31')).toBe(1000);
  });
  it('counts every posting up to and including that day', () => {
    expect(balanceAsAt(account, '2026-09-01')).toBe(1500);
    expect(balanceAsAt(account, '2026-09-02')).toBe(1300);
    expect(balanceAsAt(account, '2026-09-04')).toBe(1300);
  });
  it('reaches the current balance once every posting has happened', () => {
    expect(balanceAsAt(account, '2026-09-05')).toBe(1600);
    expect(balanceAsAt(account, '2026-12-31')).toBe(account.balance);
  });
  it('falls back to the current balance with no ledger, and to zero with no account', () => {
    expect(balanceAsAt({ balance: 42 }, '2026-09-01')).toBe(42);
    expect(balanceAsAt(undefined, '2026-09-01')).toBe(0);
  });
  it('drives the day screen instead of a fixed current balance', () => {
    const day = readFileSync('app/bank-day.tsx', 'utf8').replace(/\r\n/g, '\n');
    expect(day).toContain('const openingBalance = balanceAsAt(account, date);');
    expect(day).not.toContain('const openingBalance = account?.balance ?? 0;');
  });
});
