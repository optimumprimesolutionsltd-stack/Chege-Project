import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { categorisableLines, categoriseLines, confirmableLines, confirmLines, isConfirmedToSave, lineMatches, type Choice, type PreviewLine } from '@/lib/mpesaImport';

const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: 0, status: 'ready', reason: null, receipt: 'TESTSEND1', direction: 'out', type: 'person_payment', amount: 70,
  description: 'Sample Person', date: '2026-09-02', fee: null, mpesaBalance: 0, alreadyRecorded: null, ...over,
});

const bundle = (index: number) => line({ index, receipt: `BUNDLE${index}`, type: 'airtime', description: 'Safaricom Data Bundles', amount: 50 });
const person = line({ index: 9, description: 'Erick Otieno', amount: 3052 });

// "Search internet bundles and save those, because there is no dispute."
describe('finding entries in the review', () => {
  it('matches every word, ignoring case, across payee, kind, code and amount', () => {
    expect(lineMatches(bundle(1), 'bundle')).toBe(true);
    expect(lineMatches(bundle(1), 'SAFARICOM data')).toBe(true);
    expect(lineMatches(person, 'bundle')).toBe(false);
    expect(lineMatches(person, '3052')).toBe(true);
    expect(lineMatches(person, '')).toBe(true);
  });

  it('matches the category chosen for the line, so a statement can be saved a category at a time', () => {
    expect(lineMatches(person, 'transport', 'Transport')).toBe(true);
    expect(lineMatches(person, 'transport', 'Food')).toBe(false);
  });

  it('matches the name M-Pesa gave when a nickname is shown', () => {
    expect(lineMatches(line({ description: 'Mama mboga', original: 'JANE WANJIRU' }), 'wanjiru')).toBe(true);
  });
});

describe('confirming or categorising what was found, all together', () => {
  const found = [bundle(1), bundle(2), bundle(3)];
  const choices: Record<number, Choice> = {
    1: { include: true, category: 'Internet', auto: true },
    2: { include: true, category: '', auto: true },
    3: { include: false, category: 'Internet', auto: true },
  };

  it('confirms only ticked suggestions with nothing missing', () => {
    expect(confirmableLines(found, choices).map((l) => l.index)).toEqual([1]);
    const next = confirmLines(confirmableLines(found, choices), choices);
    expect(isConfirmedToSave(bundle(1), next[1])).toBe(true);
    expect(next[2]).toBe(choices[2]);
  });

  it('gives one category to every ticked payment out, which then counts as confirmed', () => {
    const targets = categorisableLines(found, choices);
    expect(targets.map((l) => l.index)).toEqual([1, 2]);
    const next = categoriseLines(targets, choices, 'Internet');
    expect(isConfirmedToSave(bundle(1), next[1])).toBe(true);
    expect(isConfirmedToSave(bundle(2), next[2])).toBe(true);
    expect(next[3]).toBe(choices[3]);
  });

  it('leaves money in, moves and debts alone', () => {
    const mixed = [line({ index: 4, direction: 'in' }), line({ index: 5 }), line({ index: 6 })];
    const picks: Record<number, Choice> = {
      4: { include: true, category: '' },
      5: { include: true, category: '', transferTo: 3 },
      6: { include: true, category: '', debt: { kind: 'lend', partyId: 1 } },
    };
    expect(categorisableLines(mixed, picks)).toEqual([]);
  });
});

describe('the review screen wires it up, asking before any change', () => {
  const screen = readFileSync('app/mpesa-import.tsx', 'utf8');

  it('filters the list by the search', () => {
    expect(screen).toContain('&& lineMatches(item, find, choices[item.index]?.category) && inMonth(item, month));');
    expect(screen).toContain('testID="mpesa-review-find"');
  });

  it('asks before confirming or categorising what was found', () => {
    expect(screen).toContain("{ text: 'Confirm them', onPress: () => setChoices((current) => confirmLines(toConfirm, current)) },");
    expect(screen).toContain('onPress: () => setChoices((current) => categoriseLines(targets, current, name)) },');
  });
});
