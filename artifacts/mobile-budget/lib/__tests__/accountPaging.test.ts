import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// docs/account-list-paging.md: screens ask for only the entries they show.
const home = readFileSync('app/(tabs)/index.tsx', 'utf8');
const activity = readFileSync('app/(tabs)/history.tsx', 'utf8');
const route = readFileSync('../api-server/src/routes/joint-account.ts', 'utf8');

describe('screens ask for only what they show (9 Oct 2026)', () => {
  it('Home: the balance and the month\'s totals, no entries', () => {
    expect(home).toContain('const homeAccountParams = { month, year, limit: 0 };');
    // Home shows the balance (How much do I have?) and a below-zero warning;
    // the Bank accounts card with the month's in and out left Home on 9 Oct 2026.
    expect(home).toContain('balance={bankAccount?.balance}');
    expect(home).toContain('bankAccount.balance < 0');
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

describe('Bank fills at once (9 Oct 2026)', () => {
  const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
  it('shows the newest entries while the whole list is on its way, then the whole list', () => {
    expect(bank).toContain('const firstPageParams = { ...(selectedAccountId ? { accountId: selectedAccountId } : {}), limit: BANK_FIRST_PAGE };');
    expect(bank).toContain('const data = fullData ?? firstPage;');
    expect(bank).toContain('testID="bank-loading-older"');
  });
  it('a period\'s figures wait for every entry in it', () => {
    expect(bank).toContain('const periodSummary = fullData && period ? summarisePeriod(fullData as never, period) : null;');
  });
});
