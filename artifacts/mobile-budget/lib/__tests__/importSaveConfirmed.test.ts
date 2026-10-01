import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { carryChoices, isConfirmedToSave, reviewStatus, type Choice, type PreviewLine } from '@/lib/mpesaImport';

const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: 0,
  status: 'ready',
  reason: null,
  receipt: 'TESTSEND1',
  direction: 'out',
  type: 'person_payment',
  amount: 70,
  description: 'Sample Person',
  date: '2026-09-02',
  fee: null,
  mpesaBalance: 0,
  alreadyRecorded: null,
  ...over,
});

const suggested: Choice = { include: true, category: 'Food', auto: true };

// A full statement takes days to check. Only what the person has confirmed or
// changed is saved; Jamvi's untouched suggestions wait for them.
describe('saving only what has been confirmed', () => {
  it('leaves an untouched suggestion out', () => {
    expect(reviewStatus(line({}), suggested)).toBe('suggested');
    expect(isConfirmedToSave(line({}), suggested)).toBe(false);
  });

  it('saves a suggestion once it is confirmed as it is', () => {
    const confirmed = { ...suggested, confirmed: true };
    expect(reviewStatus(line({}), confirmed)).toBe('changed');
    expect(isConfirmedToSave(line({}), confirmed)).toBe(true);
  });

  it('saves a line whose category was chosen by hand', () => {
    expect(isConfirmedToSave(line({}), { include: true, category: 'Rent', auto: false })).toBe(true);
  });

  it('never saves a line that still needs something, or one left unticked', () => {
    expect(isConfirmedToSave(line({}), { include: true, category: '', auto: false, confirmed: true })).toBe(false);
    expect(isConfirmedToSave(line({}), { ...suggested, include: false, confirmed: true })).toBe(false);
  });

  it('never saves a line already recorded', () => {
    expect(isConfirmedToSave(line({ alreadyRecorded: { date: '2026-09-02', description: 'x' } as PreviewLine['alreadyRecorded'] }), { ...suggested, confirmed: true })).toBe(false);
  });
});

describe('reading the same statement again keeps what was worked through', () => {
  it('carries each choice to the same receipt in the new reading', () => {
    const before = [line({ index: 0, receipt: 'A1' }), line({ index: 1, receipt: 'B2', amount: 500 })];
    const after = [line({ index: 7, receipt: 'B2', amount: 500 }), line({ index: 8, receipt: 'A1' }), line({ index: 9, receipt: 'C3' })];
    const fresh: Record<number, Choice> = { 7: suggested, 8: suggested, 9: suggested };
    const kept = carryChoices(before, { 0: { ...suggested, confirmed: true }, 1: { include: true, category: 'Rent', auto: false } }, after, fresh);
    expect(kept[7]).toEqual({ include: true, category: 'Rent', auto: false });
    expect(kept[8]).toEqual({ ...suggested, confirmed: true });
    expect(kept[9]).toBe(suggested);
  });

  it('does not carry a choice across a different amount on the same receipt', () => {
    const kept = carryChoices([line({ index: 0, receipt: 'A1', amount: 70 })], { 0: { ...suggested, confirmed: true } }, [line({ index: 3, receipt: 'A1', amount: 7 })], { 3: suggested });
    expect(kept[3]).toBe(suggested);
  });
});

describe('the import screen saves a statement only after asking', () => {
  const screen = readFileSync('app/mpesa-import.tsx', 'utf8');

  it('saves only confirmed lines from a statement', () => {
    expect(screen).toContain('if (onlyConfirmed && !isConfirmedToSave(item, choice)) return [];');
    expect(screen).toContain('? `Save ${confirmedCount} confirmed`');
  });

  it('asks before saving, and can be told not yet', () => {
    expect(screen).toContain("{ text: 'Not yet', style: 'cancel' },");
    expect(screen).toContain("{ text: 'Save', onPress: () => void saveLines() },");
  });

  it('offers Confirm on each suggestion', () => {
    expect(screen).toContain('testID={`mpesa-line-confirm-${item.index}`}');
  });

  it('keeps choices when the statement is read again', () => {
    expect(screen).toContain('const built = lines ? carryChoices(lines, choices, shown, fresh) : fresh;');
  });
});

// The starting balance came back only from a fresh reading, and the only way to
// one was Start over - which threw away days of choices and the copy on the phone.
describe('reading the statement again keeps the work in progress', () => {
  const screen = readFileSync('app/mpesa-import.tsx', 'utf8');

  it('shows the picker over the entries without clearing them', () => {
    expect(screen).toContain('{!lines || rereading ? (');
    expect(screen).toContain('{lines && !rereading ? (');
    expect(screen).toContain('testID="mpesa-rereading-back"');
  });

  it('offers it where the balance check is missing, and at the end of the list', () => {
    expect(screen).toContain('testID="mpesa-balance-missing-read-again"');
    expect(screen).toContain('testID="mpesa-read-again"');
  });

  it('leaves the reading mode only once the new reading is in, with choices carried', () => {
    expect(screen).toContain('setChoices(built);\n      setRereading(false);'.replace(/\n/g, screen.includes('\r\n') ? '\r\n' : '\n'));
  });
});
