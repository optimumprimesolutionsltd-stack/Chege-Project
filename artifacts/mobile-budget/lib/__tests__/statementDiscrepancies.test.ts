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

// "Bring the statement comparison to the web too" (3 Oct 2026).
describe('the same comparison on the web import', () => {
  const web = readFileSync('../family-budget/src/pages/mpesa-import.tsx', 'utf8');

  it('shows both balances, what is extra in Jamvi and what is missing from it', () => {
    for (const testId of ['mpesa-opening-fix', 'mpesa-balance-sides', 'mpesa-not-on-statement', 'mpesa-missing-in-jamvi']) {
      expect(web).toContain(`data-testid="${testId}"`);
    }
    expect(web).toContain('notOnStatement(statementReading, accountRows as unknown as RecordedRow[])');
    expect(web).toContain('missingInJamvi(statementReading, accountRows as unknown as RecordedRow[])');
  });

  it('sorts each difference out where it is shown, removals with Undo', () => {
    for (const action of ['mpesa-fix-extras', 'mpesa-add-missing', 'mpesa-update-fuliza', 'mpesa-opening-fix-button']) {
      expect(web).toContain(`data-testid="${action}"`);
    }
    expect(web).toContain('data-testid={`mpesa-extra-remove-${row.id}`}');
    expect(web).toContain('data-testid={`mpesa-amount-fix-${row.id}`}');
    expect(web).toContain('statementUndo.schedule(`extra:${row.id}`');
  });
});
