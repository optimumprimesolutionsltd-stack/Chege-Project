import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GROUP_ROWS_STEP, accountsOf, groupRowsShown } from '../openGroup';

// "In the all expenses tab, by category is also lagging trying to do any editing" (9 Oct 2026).
describe('an open group on All expenses', () => {
  it('draws its rows a page at a time', () => {
    expect(groupRowsShown(12, 0)).toBe(12);
    expect(groupRowsShown(700, 0)).toBe(GROUP_ROWS_STEP);
    expect(groupRowsShown(700, 2)).toBe(GROUP_ROWS_STEP * 3);
    expect(groupRowsShown(700, 100)).toBe(700);
  });

  it('names the accounts its bank and M-Pesa entries sit in, once each', () => {
    expect(accountsOf([
      { source: 'bank_disbursement', accountId: 4 },
      { source: 'bank_disbursement', accountId: 4 },
      { source: 'bank_disbursement', accountId: 9 },
      { source: 'expense', accountId: 7 },
      { source: 'bank_disbursement', accountId: null },
    ])).toEqual([4, 9]);
  });

  it('is what the screen uses, for By category and By item alike', () => {
    const screen = readFileSync('app/expense-ledger.tsx', 'utf8');
    expect(screen).toContain('group.rows.slice(0, groupRowsShown(group.rows.length, groupMore[group.key] ?? 0)).map(renderEntry)');
    expect(screen).toContain('for (const accountId of accountsOf(rows))');
    expect(screen).not.toContain('{group.rows.map(renderEntry)}');
  });
});

// "The search button is also lagging" (9 Oct 2026).
describe('Search', () => {
  const screen = readFileSync('app/(tabs)/search.tsx', 'utf8');
  it('runs again only while in view, and keeps results on screen while it refreshes', () => {
    expect(screen).toContain('subscribed: onScreen,');
    expect(screen).toContain('const searching = search.isFetching && !search.data;');
    expect(screen).not.toContain('{search.isFetching ? (');
  });
});
