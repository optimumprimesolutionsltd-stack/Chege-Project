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
    expect(route).toContain('GROUP BY lower(btrim(e.description))');
  });

  it('shows the spelling used most recently', () => {
    expect(route).toContain('(array_agg(e.description ORDER BY e.date DESC, e.id DESC))[1] AS "description"');
  });

  it('counts the whole expense, not a category portion', () => {
    // A 5,000 shop split across Food and Household still cost 5,000.
    expect(route).toContain('COALESCE(SUM(e.amount), 0) AS "total"');
  });

  it('is reachable from Reports', () => {
    expect(reports).toContain("router.push('/spending-by-item')");
    expect(reports).toContain('testID="open-spending-by-item"');
    expect(layout).toContain('<Stack.Screen name="spending-by-item"');
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

  it('names the joint bank rather than leaving the payer blank', () => {
    expect(screen).toContain("entry.paidFromBank ? 'Joint bank' : entry.payerName");
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
