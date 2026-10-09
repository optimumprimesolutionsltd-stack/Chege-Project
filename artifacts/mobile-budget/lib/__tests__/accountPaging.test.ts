import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// docs/account-list-paging.md: screens ask for only the entries they show.
const home = readFileSync('app/(tabs)/index.tsx', 'utf8');
const activity = readFileSync('app/(tabs)/history.tsx', 'utf8');
const route = readFileSync('../api-server/src/routes/joint-account.ts', 'utf8');

describe('screens ask for only what they show (9 Oct 2026)', () => {
  it('Home: the balance and the month\'s totals, no entries', () => {
    expect(home).toContain('const homeAccountParams = { month, year, limit: 0 };');
    expect(home).toContain('const monthlyDeposited = bankAccount?.monthDeposits ?? 0;');
    expect(home).toContain('const monthlyDisbursed = bankAccount?.monthDisbursements ?? 0;');
    // "Nothing recorded yet" no longer needs the entries to know.
    expect(home).toContain('bankAccount.totalDeposits === 0 && bankAccount.totalDisbursements === 0');
  });

  it('Activity: only the month on screen', () => {
    expect(activity).toContain('const bankMonthParams = { month, year };');
  });

  it('the server describes only the page, and is unchanged without one', () => {
    expect(route).toContain('const page = pageOf(entries, { limit, before, month, year });');
    expect(route).toContain('const enriched = await enrichTransactions(page.rows.map(({ entry }) => entry), groupId);');
    expect(route).toContain('...(paged ? {');
  });
});
