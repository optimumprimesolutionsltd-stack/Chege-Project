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

  it('keeps the remove button out of the way until editing', () => {
    const rowActions = budget.slice(budget.indexOf('<View style={styles.incomeEditActions}>'), budget.indexOf('Remove ${source.name}'));
    expect(rowActions).toContain('handleDeleteIncomeSource(source)');
  });

  // From a real phone: "the figures are able to edit but not the words". A name
  // needed a pencil and a tick of its own, so one typed and then left for Save
  // changes was dropped. Names now edit and save like the figures.
  it('edits names in place, like the figures', () => {
    expect(budget).toContain('value={incomeNameDrafts[source.id] ?? source.name}');
    expect(budget).toContain('testID={`income-name-${source.id}`}');
  });

  it('saves names and figures together with one Save', () => {
    expect(budget).toContain("|| (incomeNameDrafts[source.id] !== undefined && draftName(source) !== source.name),");
    expect(budget).toContain('name: draftName(source),');
  });

  it('refuses to save a stream with its name cleared', () => {
    expect(budget).toContain("Alert.alert('Name required'");
  });

  it('has no separate pencil and tick for a name any more', () => {
    expect(budget).not.toContain('handleStartEditIncomeSource');
    expect(budget).not.toContain('handleSaveIncomeSource');
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

// From a real phone: the Edit pill was pushed past the right edge, showing only "Edi".
describe('the Edit pill on the income streams heading stays on screen', () => {
  const budget = read('app/(tabs)/budget.tsx');
  it('lets the heading text shrink and keeps the pill whole', () => {
    const header = budget.slice(budget.indexOf('<View style={styles.incomeHeader}>'), budget.indexOf('testID="income-edit"'));
    expect(header).toContain('style={{ flex: 1, minWidth: 0 }}');
    expect(header).toContain('style={{ flexShrink: 0, marginLeft: 8 }}');
  });
});

