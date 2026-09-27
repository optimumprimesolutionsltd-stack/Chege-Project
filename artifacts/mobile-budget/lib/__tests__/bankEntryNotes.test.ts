import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// A plain note against a bank entry, the same as expenses already have.
describe('the Notes field on the Bank tab', () => {
  const bank = read('app/(tabs)/bank.tsx');

  it('is offered on an ordinary deposit and an ordinary withdrawal, not on transfers', () => {
    expect(bank).toContain('testID="bank-notes-input"');
    expect((bank.match(/testID="bank-notes-input"/g) ?? []).length).toBe(2);
  });

  it('is cleared with the rest of the form, and restored when reopening an entry to edit it', () => {
    expect(bank).toContain("setNotes('');");
    expect(bank).toContain('setNotes(tx.notes ?? \'\');');
  });

  it('is sent when saving a deposit or a withdrawal, new or edited', () => {
    expect((bank.match(/notes: notes\.trim\(\) \|\| undefined,/g) ?? []).length).toBe(4);
    expect(bank).toContain('notes: notes.trim() || null,');
  });

  it('shows a small marker on an entry that has one, without printing the note itself in the list', () => {
    expect(bank).toContain('bank-has-notes-${item.id}');
    expect(bank).toContain('Has a note: ${item.notes}');
  });
});
