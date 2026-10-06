import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPostings, canAddNote, type PostingContext, type PreviewLine } from '@/lib/mpesaImport';

// "Brief descriptions ... when you have selected a category or someone/business
// during import. It should be optional" (6 Oct 2026). #417 saved a note but no
// screen had the box to type one.
const ctx: PostingContext = { accountId: 9, userId: 'u1', isShared: false, today: '2026-10-06', chargeCategory: 'Bank charges' };
const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: 0, status: 'ready', reason: null, receipt: 'TESTNOTE01', direction: 'out', type: 'person_payment', amount: 3500,
  description: 'Alice Mwangi', date: '2026-10-02', fee: null, mpesaBalance: 0, alreadyRecorded: null, ...over,
});

describe('a note on an import line', () => {
  it('is offered once the line says what the money was', () => {
    expect(canAddNote({ include: true, category: 'Groceries' })).toBe(true);
    expect(canAddNote({ include: true, category: '', debt: { partyId: 3, kind: 'lend' } })).toBe(true);
    expect(canAddNote({ include: true, category: '', incomeSourceId: 4 })).toBe(true);
  });

  it('is not offered before that, on an unticked line, or on a move between your own places', () => {
    expect(canAddNote({ include: true, category: '' })).toBe(false);
    expect(canAddNote({ include: false, category: 'Groceries' })).toBe(false);
    expect(canAddNote({ include: true, category: 'Groceries', transferTo: 4 })).toBe(false);
    expect(canAddNote({ include: true, category: 'Groceries', savingsGoalId: 2 })).toBe(false);
    expect(canAddNote(undefined)).toBe(false);
  });

  it('is saved with the entry when typed, and left out when blank', () => {
    const noted = buildPostings(line({}), { include: true, category: 'Groceries', notes: '  For the party  ' }, ctx)!;
    expect(noted.main).toMatchObject({ notes: 'For the party' });
    const blank = buildPostings(line({}), { include: true, category: 'Groceries', notes: '   ' }, ctx)!;
    expect(blank.main).not.toHaveProperty('notes');
  });

  it('has its box on the phone and the web, behind an optional link', () => {
    for (const file of ['app/mpesa-import.tsx', '../family-budget/src/pages/mpesa-import.tsx']) {
      const screen = readFileSync(file, 'utf8');
      expect(screen).toContain('canAddNote(choice) ? (');
      expect(screen).toContain('Add a note (optional)');
      expect(screen).toContain('placeholder="A short note (optional)"');
    }
  });
});
