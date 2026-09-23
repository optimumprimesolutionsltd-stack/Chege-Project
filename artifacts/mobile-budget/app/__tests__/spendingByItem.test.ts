import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const screen = readFileSync('app/spending-by-item.tsx', 'utf8');
const reports = readFileSync('app/(tabs)/reports.tsx', 'utf8');
const layout = readFileSync('app/_layout.tsx', 'utf8');
const route = readFileSync('../api-server/src/routes/dashboard.ts', 'utf8');

// The Budget tab answers per category: how much on Food, how much on
// Transport. Nobody budgets a category called Netflix, so "how much have I
// spent on this particular thing" had no answer anywhere in the app.
describe('spending by the thing itself, not the category', () => {
  it('groups on the name however it was typed', () => {
    // "Netflix", "netflix " and "NETFLIX" are one subscription.
    expect(route).toContain('GROUP BY lower(btrim(spending.description))');
  });

  it('shows the spelling used most recently', () => {
    expect(route).toContain('(array_agg(spending.description ORDER BY spending.date DESC, spending.id DESC))[1] AS "description"');
  });

  it('counts the whole expense, not a category portion', () => {
    // A 5,000 shop split across Food and Household still cost 5,000.
    expect(route).toContain('COALESCE(SUM(spending.amount), 0) AS "total"');
  });

  it('is reachable from Reports', () => {
    expect(reports).toContain("router.push('/spending-by-item')");
    expect(reports).toContain('testID="open-spending-by-item"');
    expect(layout).toContain('<Stack.Screen name="spending-by-item"');
  });
});

// A categorised bank withdrawal is spending by every other figure in the
// app — the category breakdown counts it, the budget measures against it —
// but it lives in joint_account_transactions, not expenses. This page used
// to read only the expenses table, so it could say "no expenses recorded"
// to somebody who had spent all month through the bank.
describe('a categorised bank withdrawal counts as spending here too', () => {
  it('unions it in, excluding a transfer or one already counted as an expense', () => {
    expect(route).toContain("FROM joint_account_transactions tx");
    expect(route).toContain("tx.type = 'disbursement'");
    expect(route).toContain('tx.bank_transfer_id IS NULL');
    expect(route).toContain('tx.expense_id IS NULL');
    expect(route).toContain('tx.expense_category IS NOT NULL');
  });

  it('cannot be edited from here — the balance follows it on the Banking tab', () => {
    expect(screen).toContain("onPress={entry.fromBank ? undefined : () => router.push(getExpenseEditHref({ id: entry.id, date: entry.date }))}");
    expect(screen).toContain("{entry.fromBank ? ' · from Banking' : ''}");
  });
});

describe('the span it answers about', () => {
  it('offers the ranges a recurring bill is asked about', () => {
    expect(screen).toContain('const PRESETS = [3, 6, 12] as const;');
  });

  it('starts on a year, not on this month', () => {
    // "How much do I spend on rent" is not a question about one month.
    expect(screen).toContain('useState<Preset>(12)');
  });

  it('puts the span and the search in the cache key', () => {
    // Otherwise changing either shows the previous answer under new controls.
    expect(screen).toContain('queryKey: getGetDashboardSpendingByItemQueryKey(query)');
    expect(screen).toContain('[rangeFrom, rangeTo, search, category]');
  });

  it('reads a backwards range as the span between the dates', () => {
    expect(screen).toContain('orderedRange(');
  });
});

describe('a total that can be checked rather than believed', () => {
  it('loads the expenses behind a total only once one is opened', () => {
    expect(screen).toContain('enabled: openItem !== null');
    expect(route).toContain('const entries = item == null ? null :');
  });

  it('opens the expense itself from an entry', () => {
    expect(screen).toContain('getExpenseEditHref({ id: entry.id, date: entry.date })');
  });

  it('names the group rather than leaving the payer blank', () => {
    // The wording lives in one constant now, so it can be changed in one
    // place rather than in the hundred-odd spots it used to be written out.
    expect(screen).toContain('entry.paidFromBank ? GROUP_ATTRIBUTION : entry.payerName');
  });
});

describe('the layout survives a narrow phone', () => {
  it('lets the name shrink instead of starving it', () => {
    // A long shop name beside a bold total needs somewhere to give.
    for (const rule of ['headerText: { flex: 1, minWidth: 0 }', 'cardText: { flex: 1, minWidth: 0 }']) {
      expect(screen).toContain(rule);
    }
  });

  it('keeps the list clear of the home indicator', () => {
    expect(screen).toContain('paddingBottom: insets.bottom + 32');
  });
});
