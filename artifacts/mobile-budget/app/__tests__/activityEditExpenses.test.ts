import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const history = readFileSync(join(__dirname, '..', '(tabs)', 'history.tsx'), 'utf8');
const bank = readFileSync(join(__dirname, '..', '(tabs)', 'bank.tsx'), 'utf8');
const fab = readFileSync(join(__dirname, '..', '..', 'components', 'GlobalFAB.tsx'), 'utf8');

// Edit on Activity's Expenses seemed to do nothing: the rows never redrew and
// Save / Cancel sat after hundreds of expenses.
describe('Edit on Activity expenses', () => {
  it('redraws the rows when edit mode or a marked expense changes', () => {
    expect(history).toContain('extraData={`${expEditor.editing}-${expenses.filter((exp) => expEditor.isRemoving(exp.id)).length}-${expEditor.saving}`}');
  });

  // "An edit button not just remove button and the two should be at the top with
  // a save button at the bottom" (8 Oct 2026).
  it('keeps Save and Cancel floating at the bottom, in reach, in place of the quick-action bar', () => {
    expect(history).toContain('testID="history-expense-edit-bar"');
    expect(history).toContain("position: 'absolute', left: 12, right: 12, bottom: 8");
    expect(history).toContain('setQuickBarHidden(editingExpenses);');
    expect(fab).toContain('if (hidden && !arranging) return null;');
    expect(history).not.toContain('ListFooterComponent={\n              expEditor.editing');
  });

  it('puts Edit and Remove along the top of each entry', () => {
    const row = history.slice(history.indexOf('testID={`history-edit-row-${row.item.id}`}'));
    expect(row.indexOf('testID={`history-edit-${row.item.id}`}')).toBeLessThan(row.indexOf('<ExpenseRow expense={row.item} colors={colors} />'));
    expect(row.indexOf('testID={`list-remove-${row.item.id}`}')).toBeLessThan(row.indexOf('<ExpenseRow expense={row.item} colors={colors} />'));
  });

  it('opens an M-Pesa or bank entry on Bank, on its own account', () => {
    expect(history).toContain("router.push(`/(tabs)/bank?editTx=${-exp.id}${accountId ? `&accountId=${accountId}` : ''}&opened=${Date.now()}&returnTo=${encodeURIComponent('/(tabs)/history')}` as never);");
    // And back to Activity once the edit is saved or closed, with its place kept.
    expect(bank).toContain('markReturning(back);');
    expect(bank).toContain('openEdit(tx as Tx);');
    expect(bank).toContain('selectAccount(wanted);');
  });
});
