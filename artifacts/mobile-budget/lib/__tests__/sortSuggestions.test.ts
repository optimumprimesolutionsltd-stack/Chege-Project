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
