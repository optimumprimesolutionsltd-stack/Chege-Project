import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { matchesSearch } from '@/lib/bankSearch';

// "Put a search button" on the Bank tab (7 Oct 2026).
const tx = {
  description: 'NAIVAS WESTLANDS', expenseCategory: 'Groceries', notes: 'For the party', mpesaReceipt: 'UA3F92RVLA',
  madeByName: 'Chege', debtPartyName: null, savingsGoalName: null, bankTransferAccountName: null, amount: 3500,
};

describe('searching the Bank list', () => {
  it('finds an entry by any word in it, ignoring case', () => {
    expect(matchesSearch(tx, 'naivas')).toBe(true);
    expect(matchesSearch(tx, 'groceries')).toBe(true);
    expect(matchesSearch(tx, 'party')).toBe(true);
    expect(matchesSearch(tx, 'ua3f92')).toBe(true);
  });

  it('needs every word typed', () => {
    expect(matchesSearch(tx, 'naivas groceries')).toBe(true);
    expect(matchesSearch(tx, 'naivas fuel')).toBe(false);
  });

  it('finds an amount however it is typed', () => {
    expect(matchesSearch(tx, '3500')).toBe(true);
    expect(matchesSearch(tx, '3,500')).toBe(true);
    expect(matchesSearch(tx, 'KES3500')).toBe(true);
    expect(matchesSearch(tx, '350')).toBe(false);
  });

  it('matches everything when nothing is typed', () => {
    expect(matchesSearch(tx, '   ')).toBe(true);
  });

  it('is on the Bank tab, narrowing the list but not the period figures', () => {
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain('testID="bank-search-toggle"');
    expect(bank).toContain('data={listedTransactions}');
    expect(bank).toContain('for (const tx of shownTransactions) {');
  });
});
