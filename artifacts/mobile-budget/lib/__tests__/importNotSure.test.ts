import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inMonth, monthsOf, type Choice, type PreviewLine } from '@/lib/mpesaImport';
import { isNotSure, needsNotSureCategory, NOT_SURE_CATEGORY, toMarkAfterSave, toSortTitle } from '@/lib/entriesToSort';

const line = (index: number, over: Partial<PreviewLine> = {}): PreviewLine => ({
  index, status: 'ready', reason: null, receipt: `R${index}`, direction: 'out', type: 'paybill_payment',
  amount: 100, description: 'Somebody', date: '2026-01-04', fee: 0, mpesaBalance: null, alreadyRecorded: null, ...over,
});

// Asked for 2 Oct 2026, importing January to September.
describe('saving an old entry as Not sure, to sort out later', () => {
  it('money out goes to a real Not sure yet category, made the first time', () => {
    const choices: Record<number, Choice> = { 1: { include: true, category: NOT_SURE_CATEGORY, auto: false } };
    expect(needsNotSureCategory([line(1)], choices, ['Food'])).toBe(true);
    expect(needsNotSureCategory([line(1)], choices, ['Food', 'not sure yet'])).toBe(false);
    expect(needsNotSureCategory([line(1)], { 1: { include: true, category: 'Food' } }, ['Food'])).toBe(false);
    expect(isNotSure(' Not Sure Yet ')).toBe(true);
  });

  it('money in left with no source is marked - not a debt, contribution or Fuliza', () => {
    const lines = [
      line(1, { direction: 'in', type: 'person_receipt' }),
      line(2, { direction: 'in', type: 'person_receipt' }),
      line(3, { direction: 'in', type: 'fuliza_borrowed' }),
      line(4, { direction: 'in', type: 'person_receipt' }),
      line(5),
    ];
    const choices: Record<number, Choice> = {
      1: { include: true, category: '', incomeSourceId: null },
      2: { include: true, category: '', incomeSourceId: 9 },
      3: { include: true, category: '' },
      4: { include: true, category: '', debt: { kind: 'borrowed', partyId: 1 } },
      5: { include: true, category: 'Food' },
    };
    const saved = new Map([[1, 101], [2, 102], [3, 103], [4, 104], [5, 105]]);
    expect(toMarkAfterSave(lines, choices, saved)).toEqual([101]);
    // It used to be only when the budget had income sources: in one with none,
    // money in was never asked about and the income picture stayed empty.
    expect(toSortTitle(1)).toBe('1 entry to sort out');
  });
});

describe('working through a statement month by month', () => {
  it('lists the months oldest first with how many, and filters to one', () => {
    const lines = [line(1, { date: '2026-02-01' }), line(2, { date: '2026-01-31' }), line(3, { date: '2026-01-02' })];
    expect(monthsOf(lines)).toEqual([{ key: '2026-01', label: 'Jan', count: 2 }, { key: '2026-02', label: 'Feb', count: 1 }]);
    expect(monthsOf([line(1, { date: '2025-12-30' }), line(2, { date: '2026-01-02' })])[0].label).toBe('Dec 2025');
    expect(inMonth(lines[0], '2026-02')).toBe(true);
    expect(inMonth(lines[1], '2026-02')).toBe(false);
    expect(inMonth(lines[1], null)).toBe(true);
  });
});

describe('both import screens, the reminder and Sort them out', () => {
  const phone = readFileSync('app/mpesa-import.tsx', 'utf8');
  const web = readFileSync('../family-budget/src/pages/mpesa-import.tsx', 'utf8');

  it('filter by month, with the bulk actions working on a month too', () => {
    for (const screen of [phone, web]) {
      expect(screen).toContain('&& inMonth(item, month));');
      expect(screen).toContain('const toConfirm = filtering ? ');
      expect(screen).toContain('mpesa-review-months');
    }
  });

  it('offer Not sure yet for money out and mark money in after saving', () => {
    expect(phone).toContain('Not sure yet - save it and sort it out later');
    expect(web).toContain('Not sure yet - sort it out later');
    for (const screen of [phone, web]) {
      expect(screen).toContain('toMarkAfterSave(lines, choices, depositIds)');
      expect(screen).toContain('!isNotSure(choice.category)) {');
    }
  });

  it('remind on Home and open Sort them out', () => {
    expect(readFileSync('app/(tabs)/index.tsx', 'utf8')).toContain("router.push('/sort-entries' as never)");
    expect(readFileSync('app/_layout.tsx', 'utf8')).toContain('<Stack.Screen name="sort-entries"');
    expect(readFileSync('../family-budget/src/pages/dashboard.tsx', 'utf8')).toContain('href="/sort-entries"');
    expect(readFileSync('../family-budget/src/App.tsx', 'utf8')).toContain('<Route path="/sort-entries"');
  });
});
