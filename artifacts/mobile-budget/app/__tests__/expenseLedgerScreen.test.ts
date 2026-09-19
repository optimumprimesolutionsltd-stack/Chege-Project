import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const screen = readFileSync('app/expense-ledger.tsx', 'utf8');
const reports = readFileSync('app/(tabs)/reports.tsx', 'utf8');
const layout = readFileSync('app/_layout.tsx', 'utf8');

// Every other way into the expenses goes through something first: a category,
// or a named thing. None answered "show me everything that happened", which is
// the question you have before you know which category to look in.
describe('one list of everything', () => {
  it('is reachable from Reports', () => {
    expect(reports).toContain("router.push('/expense-ledger')");
    expect(reports).toContain('testID="open-expense-ledger"');
    expect(layout).toContain('<Stack.Screen name="expense-ledger"');
  });

  it('announces each date once instead of repeating it down the column', () => {
    expect(screen).toContain('if (last && last.date === entry.date) last.rows.push(entry);');
  });

  it('names every category a split expense was charged to', () => {
    expect(screen).toContain("entry.categories.join(' + ')");
  });

  it('puts the span and the search in the cache key', () => {
    expect(screen).toContain('queryKey: getGetDashboardExpenseLedgerQueryKey(query)');
    expect(screen).toContain('[rangeFrom, rangeTo, search]');
  });

  it('reads a backwards range as the span between the dates', () => {
    expect(screen).toContain('orderedRange(from, to)');
  });
});

describe('opening an entry', () => {
  it('opens the expense behind a row', () => {
    expect(screen).toContain("getExpenseEditHref({ id: Number(entry.id.replace('expense-', '')), date: entry.date })");
  });

  it('leaves a bank disbursement unopenable, because it is not an expense', () => {
    // There is no expense form behind a standalone disbursement, so the row
    // must not offer to open one.
    expect(screen).toContain("const href = entry.source === 'expense'");
    expect(screen).toContain('disabled={!href}');
  });
});

describe('the layout survives a narrow phone', () => {
  it('lets the description shrink rather than starving it', () => {
    for (const rule of ['headerText: { flex: 1, minWidth: 0 }', 'rowText: { flex: 1, minWidth: 0 }']) {
      expect(screen).toContain(rule);
    }
  });

  it('keeps the list clear of the home indicator', () => {
    expect(screen).toContain('paddingBottom: insets.bottom + 32');
  });
});
