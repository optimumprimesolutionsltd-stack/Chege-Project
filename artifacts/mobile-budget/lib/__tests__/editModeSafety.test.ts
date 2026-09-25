import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// From a real phone: income figures sat in boxes that were always editable, with a pencil
// and a bin on every row, so a stray tap or scroll could change what someone expects to
// earn. Figures now change only in edit mode: Edit at the top, Save at the bottom.
describe('income streams are read-only until Edit is pressed', () => {
  const budget = read('app/(tabs)/budget.tsx');

  it('has Edit at the top of the panel and Save at the bottom', () => {
    expect(budget).toContain('testID="income-edit"');
    expect(budget.indexOf('testID="income-edit"')).toBeLessThan(budget.indexOf('testID="income-save"'));
    expect(budget).toContain('testID="income-edit-footer"');
  });

  it('shows the expected amount as text unless editing, and never saves on leaving a box', () => {
    expect(budget).toContain('KES {formatKES(source.expectedMonthlyAmount ?? 0)}');
    expect(budget).not.toContain('onEndEditing={(event) => {\n                            if (canManageSharedIncome');
    expect(budget).toContain('editingIncome && (canManageSharedIncome || source.userId === user?.id) ? (');
  });

  it('saves only the figures that changed, all at once, and can be cancelled', () => {
    expect(budget).toContain('const changedIncome = incomeSources.filter(');
    expect(budget).toContain('const saveIncomeAmounts = async () => {');
    expect(budget).toContain('testID="income-edit-cancel"');
  });

  it('keeps the rename and remove buttons out of the way until editing', () => {
    const rowActions = budget.slice(budget.indexOf('editingIncome && (canManageSharedIncome || source.userId === user?.id) ? ('), budget.indexOf('Remove ${source.name}'));
    expect(rowActions).toContain('handleStartEditIncomeSource(source)');
  });
});

describe('the "Who has paid" panel', () => {
  const sheet = read('components/ContributionSheet.tsx');
  it('puts Edit on its own line at the top, not crammed into the heading', () => {
    const heading = sheet.slice(sheet.indexOf('<View style={styles.headingWrap}>'), sheet.indexOf('<View style={styles.headRight}>'));
    expect(heading).not.toContain('EditListButton');
    expect(sheet).toContain('<View style={styles.editRow}>');
  });
});
