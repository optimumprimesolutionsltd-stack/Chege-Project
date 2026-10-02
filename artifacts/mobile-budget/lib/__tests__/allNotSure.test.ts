import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isConfirmedToSave, type Choice, type PreviewLine } from '@/lib/mpesaImport';
import { NOT_SURE_CATEGORY, notSureableLines, putUnderNotSure } from '@/lib/entriesToSort';

const line = (index: number, over: Partial<PreviewLine> = {}): PreviewLine => ({
  index, status: 'ready', reason: null, receipt: `R${index}`, direction: 'out', type: 'paybill_payment',
  amount: 100, description: 'Somebody', date: '2026-01-04', fee: 0, mpesaBalance: null, alreadyRecorded: null, ...over,
});

// Asked for 2 Oct 2026: put everything - Jamvi's suggestions too - under Not
// sure, so it goes to the right tabs now and is sorted out slowly from Home
// rather than sitting in the import.
describe('putting the rest of a statement under Not sure', () => {
  const lines = [
    line(1),                                        // Jamvi's suggestion
    line(2),                                        // needs a category
    line(3),                                        // chosen by hand
    line(4, { direction: 'in', type: 'person_receipt' }),
    line(5, { type: 'transaction_charge' }),
    line(6),                                        // a debt
  ];
  const choices: Record<number, Choice> = {
    1: { include: true, category: 'Food', auto: true },
    2: { include: true, category: '' },
    3: { include: true, category: 'Rent', auto: false },
    4: { include: true, category: '', incomeSourceId: 7, sourceAuto: true },
    5: { include: true, category: 'Charges', auto: true },
    6: { include: true, category: '', debt: { kind: 'lend', partyId: 1 } },
  };

  it('takes suggestions and blanks, leaving what the person chose and lines with a place of their own', () => {
    expect(notSureableLines(lines, choices).map((item) => item.index)).toEqual([1, 2, 4]);
  });

  it('sends money out to Not sure yet and money in to no source, confirmed and not remembered', () => {
    const next = putUnderNotSure(notSureableLines(lines, choices), choices);
    expect(next[1]).toMatchObject({ category: NOT_SURE_CATEGORY, confirmed: true, remember: false });
    expect(next[2].category).toBe(NOT_SURE_CATEGORY);
    expect(next[4]).toMatchObject({ incomeSourceId: null, confirmed: true });
    expect(next[3]).toBe(choices[3]);
    for (const index of [1, 2, 4]) expect(isConfirmedToSave(lines[index - 1], next[index])).toBe(true);
  });

  it('is offered on both import screens, and Sort them out copes with a whole year', () => {
    for (const screen of [readFileSync('app/mpesa-import.tsx', 'utf8'), readFileSync('../family-budget/src/pages/mpesa-import.tsx', 'utf8')]) {
      expect(screen).toContain('const toNotSure = notSureableLines(filtering ? inView : recordable, choices);');
      expect(screen).toContain('putUnderNotSure(toNotSure, current)');
    }
    expect(readFileSync('app/sort-entries.tsx', 'utf8')).toContain('<FlatList');
    expect(readFileSync('../family-budget/src/pages/sort-entries.tsx', 'utf8')).toContain('inView.slice(0, shownCount)');
    expect(readFileSync('../api-server/src/routes/entries-to-sort.ts', 'utf8')).toContain('.limit(5000);');
  });
});
