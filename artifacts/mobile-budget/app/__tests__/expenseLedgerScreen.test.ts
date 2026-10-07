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
    expect(screen).toContain('[rangeFrom, rangeTo, searched]');
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

describe("a side hustle's costs have a tab of their own", () => {
  // "Can the cost of goods appear somewhere else, perhaps in its own tab? I do
  // not want it visible when downloading the PDF."
  it('splits Household from Business costs, by the categories linked to an income stream', () => {
    expect(screen).toContain('category.reducesIncomeSourceId != null');
    expect(screen).toContain("['business', 'Business costs'],");
    expect(screen).toContain("allEntries.filter((entry) => (scope === 'business') === isBusinessEntry(entry))");
  });

  it('totals only the tab shown, and points to the other', () => {
    expect(screen).toContain('const expensesTotal = entries.reduce((sum, entry) => sum + entry.amount, 0);');
    expect(screen).toContain('on the Business costs tab');
  });

  it('downloads this tab as a PDF, so the household one never shows stock', () => {
    expect(screen).toContain('includeExpenses: true,');
    expect(screen).toContain('...(hasBusiness ? { expensesScope: scope } : {}),');
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
