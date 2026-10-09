import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LISTS_AN_EDIT_CHANGES, withSavedRow, withoutSorted } from '@/lib/showSavedEdit';

// "When I make changes, they don't reflect immediately. Not sure yet stays for
// a long time" (8 Oct 2026).
describe('an edit shows at once', () => {
  const account = {
    balance: 100,
    transactions: [
      { id: 1, expenseCategory: 'Not sure yet', debtPartyName: null, amount: 534 },
      { id: 2, expenseCategory: 'Food', amount: 50 },
    ],
  };

  it('puts the saved row in place of the old one, keeping the rest', () => {
    const next = withSavedRow(account, { id: 1, expenseCategory: null, debtPartyName: 'Optimum prime solutions Ltd' } as never);
    expect(next.transactions[0]).toEqual({ id: 1, expenseCategory: null, debtPartyName: 'Optimum prime solutions Ltd', amount: 534 });
    expect(next.transactions[1]).toBe(account.transactions[1]);
    expect(next.balance).toBe(100);
    expect(account.transactions[0].expenseCategory).toBe('Not sure yet');
  });

  it('leaves a cached account without that row, or with nothing yet, alone', () => {
    expect(withSavedRow(account, { id: 9 })).toBe(account);
    expect(withSavedRow(undefined, { id: 1 })).toBeUndefined();
  });

  it('Bank writes the saved edit into the cache and refreshes Sort them out and the expense lists', () => {
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain('const saved = await updateTransaction({');
    expect(bank).toContain('withSavedRow(cached, saved)');
    expect(bank).toContain('for (const queryKey of LISTS_AN_EDIT_CHANGES) queryClient.invalidateQueries({ queryKey });');
    expect(LISTS_AN_EDIT_CHANGES).toContainEqual(['entries-to-sort']);
  });

  it('Sort them out drops sorted entries at once and does not wait for the account', () => {
    const list = { entries: [{ id: 1 }, { id: 2 }, { id: 3 }] };
    expect(withoutSorted(list, [1, 3])?.entries).toEqual([{ id: 2 }]);
    expect(withoutSorted(undefined, [1])).toBeUndefined();
    const sort = readFileSync('app/sort-entries.tsx', 'utf8');
    expect(sort).toContain('await done(changed.map((one) => one.id));');
    expect(sort).toContain('await done([entry.id]);');
    // Marked out of date, not fetched again per entry sorted (9 Oct 2026).
    expect(sort).toContain("void queryClient.invalidateQueries({ queryKey: getGetJointAccountQueryKey(), refetchType: 'none' });");
    expect(sort).toContain("refetchType: isHistoryQuery(queryKey) ? 'none' : 'active'");
  });

  // "Going back in sort them out is slow" (9 Oct 2026): every tab behind it
  // reloaded the whole year of entries after each entry sorted, and again on Back.
  it('tab screens follow their big lists only while in view', () => {
    const follows = (file: string, line: string) => expect(readFileSync(file, 'utf8')).toContain(line);
    follows('app/(tabs)/index.tsx', 'useGetJointAccount(homeAccountParams, { query: { queryKey: getGetJointAccountQueryKey(homeAccountParams), subscribed: onScreen } })');
    follows('app/(tabs)/bank.tsx', '{ query: { queryKey: getGetJointAccountQueryKey(jointAccountParams), subscribed: onScreen } }');
    follows('app/(tabs)/history.tsx', 'subscribed: onScreen');
    follows('app/(tabs)/reports.tsx', 'getGetDashboardIncomeStreamsTrendQueryKey({ months: 6 }), retry: false, subscribed: onScreen');
    follows('hooks/useOnScreen.ts', 'return () => setOnScreen(false);');
  });
});
