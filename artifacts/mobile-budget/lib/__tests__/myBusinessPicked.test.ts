import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bankAccountKeys, businessMatches, parseOwnerBusiness, unassignedBusinessAccounts, withBankAccountKeys } from '@/lib/ownerBusiness';

// "the process should be create a business name first and then this. otherwise
// you will have duplicate businesses coz of wrong naming" and "the business
// accounts created should auto populate here" (8 Oct 2026).
describe("My business's accounts", () => {
  const screen = readFileSync('app/my-business.tsx', 'utf8');
  const hook = readFileSync('hooks/useBusinesses.ts', 'utf8');

  it('picks the business from My businesses, and sends you to create one first when there is none', () => {
    expect(screen).not.toContain('testID="my-business-name"');
    expect(screen).toContain('testID="my-business-create-first"');
    expect(screen).toContain("router.push('/businesses' as never)");
    expect(screen).toContain('{chosen ? (<>');
  });

  it('keeps which business it is', () => {
    expect(parseOwnerBusiness(JSON.stringify({ name: 'Ujenzi', keys: [], skipped: [], incomeSourceId: 9 })).incomeSourceId).toBe(9);
    expect(parseOwnerBusiness(JSON.stringify({ name: 'Ujenzi', keys: [], skipped: [] })).incomeSourceId).toBeUndefined();
  });

  it("fills in the business's bank accounts from Bank - only that business's, and only with a number", () => {
    // One with no business chosen on Bank is nobody's yet: listed apart, counted for none.
    const accounts = [
      { id: 1, name: 'KCB Ujenzi', accountNumber: '1234 5678' },
      { id: 2, name: 'Hermda Equity', accountNumber: '9988776' },
      { id: 3, name: 'Business cash', accountNumber: null },
      { id: 4, name: 'Personal M-Pesa', accountNumber: '0712345678' },
      { id: 5, name: 'Business, which one not said', accountNumber: '5551112' },
    ];
    const businessOf = new Map<number, number | null>([[1, 9], [2, 10], [3, 9], [5, null]]);
    expect(bankAccountKeys(accounts, businessOf, 9)).toEqual([{ key: '#12345678', account: 'KCB Ujenzi' }]);
    expect(bankAccountKeys(accounts, businessOf, undefined)).toEqual([]);
    expect(unassignedBusinessAccounts(accounts, businessOf).map((account) => account.id)).toEqual([5]);
  });

  it('matches entries naming those accounts without them being typed', () => {
    const business = withBankAccountKeys({ name: 'Ujenzi', keys: [], skipped: [], incomeSourceId: 9 }, [{ key: '#12345678' }]);
    const rows = [{ id: 1, type: 'deposit', description: 'Kenya Commercial Bank (12345678)' }];
    expect(businessMatches(rows as never, business, new Set()).map((row) => row.id)).toEqual([1]);
  });

  it('adding a business under a name already used is that one, not a second', () => {
    expect(hook).toContain('const existing = streams.find((stream) => same(stream.name) === same(name));');
  });
});
