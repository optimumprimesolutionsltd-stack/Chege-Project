import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/add-expense.tsx', 'utf8');

describe('mobile normal expense mode', () => {
  it('starts new expenses in Normal while edits retain Advanced controls', () => {
    expect(source).toContain('const [isAdvanced, setIsAdvanced] = useState(isEditMode)');
    expect(source).toContain('{!isEditMode && (');
    expect(source).toContain('testID="expense-mode-normal"');
    expect(source).toContain('testID="expense-mode-advanced"');
  });

  it('synchronizes Normal mode hidden fields to a simple full allocation', () => {
    const synchronization = source.slice(
      source.indexOf('// Keep the values hidden by Normal mode deterministic'),
      source.indexOf('const handleCreateIncomeSource'),
    );

    expect(synchronization).toContain('setDate(todayIso())');
    expect(synchronization).toContain('setIsRecurring(false)');
    expect(synchronization).toContain('setPaidFromBank(false)');
    expect(synchronization).toContain('setAllowMixedFunding(false)');
    expect(synchronization).toContain('setPayerIds([user.id])');
    expect(synchronization).toContain('setCategoryAllocations(category.trim() ? [{ category: category.trim(), amount }] : [])');
    expect(source).toContain('incomeSources.find((source) => source.isMain) ?? incomeSources[0]');
  });

  it('keeps advanced-only controls out of Normal and blocks missing saved income sources', () => {
    expect(source).toContain('{isAdvanced && <View testID="expense-date-section"');
    expect(source).toContain('{isAdvanced && categoryAllocations.length > 0 && (');
    expect(source).toContain('{isAdvanced && <>');
    expect(source).toContain('{isAdvanced && (canManageShared || selectablePayers.length > 0) && (');
    expect(source).toContain('{isAdvanced && canManageShared && <View');
    expect(source).toContain('testID="normal-expense-summary"');
    expect(source).toContain('testID="normal-income-source-blocker"');
    expect(source).toContain('Switch to Advanced to add an income source');
    expect(source).toContain("Alert.alert('Income source required', 'Add a saved income source in Advanced before you can save this expense.')");
  });
});