import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const history = readFileSync(join(__dirname, '..', '(tabs)', 'history.tsx'), 'utf8');

// Edit on Activity's Expenses seemed to do nothing: the rows never redrew and
// Save / Cancel sat after hundreds of expenses.
describe('Edit on Activity expenses', () => {
  it('redraws the rows when edit mode or a marked expense changes', () => {
    expect(history).toContain('extraData={`${expEditor.editing}-${expenses.filter((exp) => expEditor.isRemoving(exp.id)).length}-${expEditor.saving}`}');
  });

  it('keeps Save and Cancel above the list, in reach', () => {
    expect(history).toContain("{activeTab === 'expenses' && expEditor.editing ? (");
    expect(history).toContain('testID="history-expense-edit-bar"');
    expect(history).not.toContain('ListFooterComponent={\n              expEditor.editing');
  });
});
