import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { suggestForSaved } from '@/lib/mpesaImport';

// "Can it go back to entries saved as not sure and preselect?" (7 Oct 2026).
const categories = ['Electricity', 'Eating out', 'Groceries', 'Shopping share', 'Fuel'];
const past = (description: string, expenseCategory: string | null) => ({ type: 'disbursement', description, expenseCategory });

describe('a suggestion for an entry saved as Not sure', () => {
  it('follows how the payee was filed before', () => {
    expect(suggestForSaved({ description: 'MAGUNAS SUPERMARKET', direction: 'out' }, [past('MAGUNAS SUPERMARKET', 'Shopping share')], categories)).toBe('Shopping share');
  });

  it('falls back to a well-known payee', () => {
    expect(suggestForSaved({ description: 'KPLC PREPAID', direction: 'out' }, [], categories)).toBe('Electricity');
    expect(suggestForSaved({ description: 'NAIVAS WESTLANDS', direction: 'out' }, [], categories)).toBe('Groceries');
  });

  it('a kept rule wins', () => {
    expect(suggestForSaved({ description: 'NAIVAS WESTLANDS', direction: 'out' }, [], categories, { 'naivas westlands': 'Fuel' })).toBe('Fuel');
  });

  it('never suggests Not sure from entries still waiting to be sorted', () => {
    expect(suggestForSaved({ description: 'Alice Mwangi', direction: 'out' }, [past('Alice Mwangi', 'Not sure yet')], categories)).toBe('');
  });

  it('only a category that carries spending, and nothing for money in', () => {
    expect(suggestForSaved({ description: 'Brother', direction: 'out' }, [past('Brother', 'Family support')], categories)).toBe('');
    expect(suggestForSaved({ description: 'KPLC PREPAID', direction: 'in' }, [], categories)).toBe('');
  });
});

describe('Sort them out shows the suggestions', () => {
  const screen = readFileSync('app/sort-entries.tsx', 'utf8');

  it('as a first, green chip, and a button for them all that asks first', () => {
    expect(screen).toContain('testID={`sort-entry-${entry.id}-suggested`}');
    expect(screen).toContain('testID="sort-entries-accept-all"');
    expect(screen).toContain('`File ${suggestedShown.length} as suggested?`');
  });
});

// Sort them out froze the phone (7 Oct 2026): a fresh filtered history per entry
// missed the matchers' cache, so 754 entries against 2,000 took 45 s on a PC.
describe('suggestions stay quick on a big list', () => {
  it('work out 754 entries against 2,000 in well under two seconds', () => {
    const payees = Array.from({ length: 400 }, (_, i) => `PAYEE ${i} ${['NAIVAS', 'KPLC', 'JOHN DOE', 'MAMA MBOGA', 'TOTAL'][i % 5]} LTD`);
    const names = ['Groceries', 'Electricity', 'Fuel', 'Eating out', 'Rent'];
    const history = Array.from({ length: 2000 }, (_, i) => ({ type: 'disbursement', description: payees[i % 400], expenseCategory: i % 3 ? names[i % 5] : 'Not sure yet' }));
    const started = performance.now();
    for (let i = 0; i < 754; i++) suggestForSaved({ description: `${payees[(i * 7) % 400]} ${i}`, direction: 'out' }, history, names);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('are worked out a batch at a time, once per payee, on a list that keeps its identity', () => {
    const screen = readFileSync('app/sort-entries.tsx', 'utf8');
    expect(screen).toContain('const entries = useMemo(() => data?.entries ?? [], [data]);');
    expect(screen).toContain('if (next < entries.length) timer = setTimeout(step, 0);');
    expect(screen).toContain('byPayee.set(key, name);');
  });
});

// "Equity Paybill Account -> Supermarket ... this is wrong suggestion. In such
// cases like bank, it should be under not sure yet" (7 Oct 2026).
describe('a payment to a bank', () => {
  const filedBefore = [past('Equity Paybill Account', 'Groceries'), past('Equity Paybill Account', 'Groceries')];

  it('gets no guess from history, similar names or words', () => {
    expect(suggestForSaved({ description: 'Equity Paybill Account', direction: 'out' }, filedBefore, categories)).toBe('');
    expect(suggestForSaved({ description: 'KCB PAYBILL AC 1234', direction: 'out' }, [], categories)).toBe('');
    expect(suggestForSaved({ description: 'Family Bank Pesa Pap', direction: 'out' }, [], categories)).toBe('');
  });

  it('still follows a rule the person kept for it', () => {
    expect(suggestForSaved({ description: 'Equity Paybill Account', direction: 'out' }, filedBefore, categories, { 'equity paybill account': 'Fuel' })).toBe('Fuel');
  });

  it('leaves other payees alone', () => {
    expect(suggestForSaved({ description: 'KPLC PREPAID', direction: 'out' }, [], categories)).toBe('Electricity');
  });
});

describe('Sort them out: search, and debt and a new category always in view', () => {
  const screen = readFileSync('app/sort-entries.tsx', 'utf8');

  it('searches by payee or amount', () => {
    expect(screen).toContain('testID="sort-entries-search-toggle"');
    expect(screen).toContain('inView(entry) && (!searched || matchesSearch(entry, searched))');
  });

  it('keeps Debt and New category in a row of their own, out of the sideways scroll', () => {
    expect(screen.indexOf('testID={`sort-entry-${entry.id}-debt`}')).toBeLessThan(screen.indexOf('<ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"'));
    expect(screen).toContain('testID={`sort-entry-${entry.id}-new-category-sheet`}');
    expect(screen).toContain('target={standardTargetFor(newCategoryFor.description)}');
  });

  it('a new category for any payee starts blank and still needs a parent and a tier', () => {
    const sheet = readFileSync('components/CreateCategorySheet.tsx', 'utf8');
    expect(sheet).toContain('target: StandardTarget | null;');
    expect(sheet).toContain('const [tier, setTier] = useState(target?.priority ?? 4);');
    expect(sheet).toContain("? 'Choose where it goes.'");
  });
});

// "Hope we also have a brief description note" (7 Oct 2026).
describe('a note while sorting out', () => {
  const screen = readFileSync('app/sort-entries.tsx', 'utf8');
  it('can be added to any entry and is saved with what it is sorted as', () => {
    expect(screen).toContain('testID={`sort-entry-${entry.id}-note-add`}');
    expect(screen).toContain('...change, ...noteChange(one.id)');
    expect(screen).toContain("expenseCategory: suggestions.get(one.id), ...noteChange(one.id)");
  });
  it('shows the note an entry already has, and only sends one typed here', () => {
    expect(screen).toContain("value={notes[entry.id] ?? entry.notes ?? ''}");
    expect(screen).toContain('notes[id] === undefined ? {} : { notes: notes[id].trim() || null }');
    expect(readFileSync('../api-server/src/routes/entries-to-sort.ts', 'utf8')).toContain('notes: jointAccountTxTable.notes,');
  });
});
