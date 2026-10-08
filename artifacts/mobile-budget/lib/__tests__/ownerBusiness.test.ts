import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { businessKeyFor, businessMatches, businessTitle, namesBusiness, parseOwnerBusiness, withKey, withSkipped } from '@/lib/ownerBusiness';

// "If the user has a business, we can specify business account numbers..." (8 Oct 2026)
describe("your business's numbers and names", () => {
  it('keeps a number as a number, spacing ignored, and anything else as a name', () => {
    expect(businessKeyFor('806 38 76')).toBe('#8063876');
    expect(businessKeyFor('0712 345 678')).toBe('#0712345678');
    expect(businessKeyFor('Optimum Prime Solutions Ltd')).toBe('optimum prime solutions ltd');
    expect(businessKeyFor('  ')).toBe('');
  });

  it('finds the business in what M-Pesa or the bank wrote', () => {
    expect(namesBusiness('Business Payment from 8063876 - OPTIMUM PRIME', ['#8063876'])).toBe(true);
    expect(namesBusiness('OPTIMUM PRIME SOLUTIONS LTD', ['optimum prime solutions ltd'])).toBe(true);
    expect(namesBusiness('Optimum Bakery', ['optimum prime solutions ltd'])).toBe(false);
    expect(namesBusiness('Paid 806387', ['#8063876'])).toBe(false);
  });

  it('marks only plain entries that name it, not yet marked, and never one set aside', () => {
    const business = withSkipped(withKey(parseOwnerBusiness(null), 'optimum prime solutions ltd'), 4);
    const rows = [
      { id: 1, type: 'deposit', description: 'Optimum Prime Solutions Ltd' },
      { id: 2, type: 'disbursement', description: 'Optimum Prime Solutions Ltd' },
      { id: 3, type: 'deposit', description: 'Optimum Prime Solutions Ltd', bankTransferId: 'abc' },
      { id: 4, type: 'deposit', description: 'Optimum Prime Solutions Ltd' },
      { id: 5, type: 'disbursement', description: 'Optimum Prime Solutions Ltd', chargeForTransactionId: 2 },
      { id: 6, type: 'deposit', description: 'Naivas' },
      { id: 7, type: 'deposit', description: 'Optimum Prime Solutions Ltd' },
    ];
    expect(businessMatches(rows, business, new Set([7])).map((row) => row.id)).toEqual([1, 2]);
  });

  it('titles it on Bank', () => {
    expect(businessTitle('in', 'Optimum')).toBe('From Optimum');
    expect(businessTitle('out', '')).toBe('To my business');
  });

  it('reads back what was stored, and nothing from damage', () => {
    expect(parseOwnerBusiness('{"name":"Optimum","keys":["#123456"],"skipped":[9]}')).toEqual({ name: 'Optimum', keys: ['#123456'], skipped: [9] });
    expect(parseOwnerBusiness('not json')).toEqual({ name: '', keys: [], skipped: [] });
  });
});

describe('where it is offered', () => {
  it('Settings, Bank and Sort them out', () => {
    expect(readFileSync('app/(tabs)/settings.tsx', 'utf8')).toContain("router.push('/my-business' as never)");
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain('useAutoMarkBusiness(data?.transactions);');
    expect(bank).toContain('testID="bank-not-my-business"');
    expect(bank).toContain('testID="bank-my-business"');
    expect(bank).toContain("ownerBusiness.markedIds.has(item.id) ? businessTitle(dep ? 'in' : 'out', ownerBusiness.business.name)");
    expect(readFileSync('app/sort-entries.tsx', 'utf8')).toContain('testID={`sort-entry-${entry.id}-my-business`}');
  });

  it('saved entries are counted and marked only when the person says so', () => {
    const screen = readFileSync('app/my-business.tsx', 'utf8');
    expect(screen).toContain("text: 'Leave them'");
    expect(screen).toContain('withSkipped(acc, row.id)');
  });
});

// "Also a bank can have an account number and a paybill number" (8 Oct 2026).
describe('a bank account: paybill and account number together', () => {
  it('keeps both, and matches only when both appear', () => {
    expect(businessKeyFor('522522 1234567')).toBe('#522522+1234567');
    expect(businessKeyFor('522522 acc 1234567')).toBe('#522522+1234567');
    expect(businessKeyFor('Paybill 522522, account no. 1234567')).toBe('#522522+1234567');
    expect(namesBusiness('KCB Paybill 522522 Acc 1234567', ['#522522+1234567'])).toBe(true);
    expect(namesBusiness('KCB Paybill 522522 Acc 7654321', ['#522522+1234567'])).toBe(false);
  });

  it('a phone number written in groups is still one number', () => {
    expect(businessKeyFor('0712 345 678')).toBe('#0712345678');
  });
});
