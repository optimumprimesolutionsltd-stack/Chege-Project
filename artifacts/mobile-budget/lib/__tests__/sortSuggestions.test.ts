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
