import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Asked for 3 Oct 2026: "compare against a statement and sort out a
// discrepancy" - each difference fixable where it is shown, not "open Bank".
describe('sorting out a difference with the statement, in the import', () => {
  const screen = readFileSync('app/mpesa-import.tsx', 'utf8');

  it('removes an entry the statement does not have, with Undo', () => {
    expect(screen).toContain('testID={`mpesa-extra-remove-${row.id}`}');
    expect(screen).toContain("undoable.schedule(`extra:${row.id}`");
    expect(screen).toContain("await customFetch(`/api/joint-account/${row.id}`, { method: 'DELETE' });");
    expect(screen).toContain('<UndoDeleteBar pending={undoable.pending} onUndo={undoable.undo} />');
    expect(screen).not.toContain('Open Bank and delete any that did not happen');
  });

  it("sets an entry saved for a different amount to the statement's", () => {
    expect(screen).toContain('testID={`mpesa-amount-fix-${row.id}`}');
    expect(screen).toContain('body: JSON.stringify({ amount: row.statement, date: row.date }),');
    expect(screen).not.toContain('Open it on Bank to correct it.');
  });
});
