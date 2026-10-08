import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initialChoices, refreshSuggestions, sourceNotGuessed, type PreviewLine } from '@/lib/mpesaImport';
import { isToCheck } from '@/lib/entriesToSort';

// "So money received from people and bank should go to not sure" (8 Oct 2026).
const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: 0, status: 'ready', reason: null, receipt: 'TESTIN0001', direction: 'in', type: 'person_receipt', amount: 3000,
  description: 'Paul Mouguo', named: true, date: '2026-08-29', fee: null, mpesaBalance: 0, alreadyRecorded: null, ...over,
});
const history = [
  { type: 'deposit', description: 'Paul Mouguo', incomeSourceId: 7 },
  { type: 'deposit', description: 'National Bank', incomeSourceId: 7 },
  { type: 'deposit', description: 'ACME LTD SALARY', incomeSourceId: 9 },
];

describe('money in that is not given a source from history', () => {
  it('from a person, a bank, or a cash deposit at an agent', () => {
    expect(sourceNotGuessed({ type: 'person_receipt', description: 'Paul Mouguo' })).toBe(true);
    expect(sourceNotGuessed({ type: 'bank_receipt', description: 'National Bank' })).toBe(true);
    expect(sourceNotGuessed({ type: 'cash_deposit', description: 'Deposit of Funds at Agent Till 337638' })).toBe(true);
    expect(sourceNotGuessed({ type: 'other', description: 'Equity Paybill Account' })).toBe(true);
  });

  it('waits with no source, so Sort them out asks', () => {
    expect(initialChoices([line({})], history as never, [], '')[0].incomeSourceId).toBeNull();
    expect(initialChoices([line({ type: 'bank_receipt', description: 'National Bank' })], history as never, [], '')[0].incomeSourceId).toBeNull();
  });

  // "The money in from people or agent or bank should be under not sure until sorted" (8 Oct 2026).
  it('starts under Not sure, answered, so it saves and comes back to sort', () => {
    for (const over of [{}, { type: 'bank_receipt', description: 'National Bank' }, { type: 'cash_deposit', description: 'Deposit of Funds at Agent Till 337638' }]) {
      const choice = initialChoices([line(over)], history as never, [], '')[0];
      expect(choice).toMatchObject({ incomeSourceId: null, sourceAuto: false, confirmed: true, include: true });
    }
  });

  it('a statement restored from before is filed the same way', () => {
    const lines = [line({})];
    const restored = { 0: { include: true, category: '', auto: false, incomeSourceId: 7, sourceAuto: true } };
    expect(refreshSuggestions(lines, restored as never, history as never, [])[0]).toMatchObject({ incomeSourceId: null, confirmed: true });
  });

  it('salary and loans are not put under Not sure', () => {
    expect(initialChoices([line({ type: 'other', description: 'ACME LTD SALARY' })], history as never, [], '')[0].confirmed).toBeUndefined();
  });

  it('other money in still learns its source', () => {
    expect(sourceNotGuessed({ type: 'other', description: 'ACME LTD SALARY' })).toBe(false);
    expect(initialChoices([line({ type: 'other', description: 'ACME LTD SALARY' })], history as never, [], '')[0].incomeSourceId).toBe(9);
  });
});

// "Ensure to sort what is done historically" (8 Oct 2026): money in saved earlier
// with a source is listed to check it, with Keep, on both screens.
describe('money in listed to check its source', () => {
  it('is told apart from money in saved as Not sure', () => {
    const entry = { id: 1, type: 'deposit', direction: 'in' as const, amount: 5, date: '2026-08-01', description: 'National Bank' };
    expect(isToCheck({ ...entry, incomeSourceId: 7 })).toBe(true);
    expect(isToCheck({ ...entry, incomeSourceId: null })).toBe(false);
    expect(isToCheck({ ...entry, direction: 'out', incomeSourceId: 7 })).toBe(false);
  });

  it('offers Keep and no "Leave it with no source" on phone and web', () => {
    const phone = readFileSync('app/sort-entries.tsx', 'utf8');
    const web = readFileSync('../family-budget/src/pages/sort-entries.tsx', 'utf8');
    expect(phone).toContain('testID={`sort-entry-${entry.id}-keep`}');
    expect(web).toContain('data-testid={`sort-entry-${entry.id}-keep`}');
    for (const screen of [phone, web]) expect(screen).toContain("&& !isToCheck(entry) ? (");
  });
});
