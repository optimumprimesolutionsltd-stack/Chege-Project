import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Choice, PreviewLine } from '../mpesaImport';
import { ruleLabel } from '../payeeLearning';
import { noteKey, rememberedNote, withNoteRule, withRememberedNotes } from '../payeeNotes';

// "When jamvi asks if it can remember a category, can it also ask if it can remember
// additional notes and in such cases to prioritize them when showing the brief
// description of payments" (11 Oct 2026).
describe('a note remembered for a payee', () => {
  const line = (index: number, description: string): PreviewLine => ({ index, status: 'ready', reason: null, receipt: `TN${index}AAAA00`, direction: 'out', type: 'person_payment', amount: 500, description, date: '2026-05-01', fee: null, mpesaBalance: null, alreadyRecorded: null });
  const choice = { include: true, category: 'Food' } as Choice;

  it('is kept with the payee rules, and let go when blank', () => {
    const rules = withNoteRule({}, 'John Kamau', '  Lunch for the workers ');
    expect(rules).toEqual({ [noteKey('John Kamau')]: 'Lunch for the workers' });
    expect(rememberedNote(rules, 'JOHN KAMAU')).toBe('Lunch for the workers');
    expect(withNoteRule(rules, 'John Kamau', ' ')).toEqual({});
    expect(ruleLabel(noteKey('John Kamau'))).toBe('Note for john kamau');
  });

  it("fills in the next payment's note, marked as remembered, never over one already there", () => {
    const rules = withNoteRule({}, 'John Kamau', 'Lunch for the workers');
    const next = withRememberedNotes([line(0, 'John Kamau'), line(1, 'Mary Njeri'), line(2, 'John Kamau')], { 0: choice, 1: choice, 2: { ...choice, notes: 'Mine' } }, rules);
    expect(next[0]).toMatchObject({ notes: 'Lunch for the workers', noteAuto: true });
    expect(next[1]).toBe(choice);
    expect(next[2].notes).toBe('Mine');
  });

  it('is asked on the import line, kept on save, and shown before M-Pesa\'s words', () => {
    const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(screen).toContain('Also remember this note for {payeeName(item.description)}');
    expect(screen).toContain('kept = withNoteRule(kept, item.description, choice.notes);');
    expect(readFileSync('app/(tabs)/bank.tsx', 'utf8')).toContain('const shownDescription = item.notes?.trim() || (namedPayees.nameFor(item.description) ?? item.description);');
    expect(readFileSync('../api-server/src/routes/dashboard.ts', 'utf8')).toContain('description: w.notes?.trim() || w.description,');
  });
});
