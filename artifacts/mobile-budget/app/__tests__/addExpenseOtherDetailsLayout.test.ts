import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/add-expense.tsx', 'utf8');
const budgetSource = readFileSync('app/(tabs)/budget.tsx', 'utf8');
const homeSource = readFileSync('app/(tabs)/index.tsx', 'utf8');

describe('optional expense category layout', () => {
  it('creates a bank account inline without resetting the expense draft', () => {
    const handler = source.slice(
      source.indexOf('const handleCreateBankAccount = useCallback'),
      source.indexOf('const chooseCategory = useCallback'),
    );
    const successBlock = handler.slice(handler.indexOf('const created ='), handler.indexOf('} catch (error)'));
    const errorBlock = handler.slice(handler.indexOf('} catch (error)'), handler.indexOf('}, [createBankAccount'));

    expect(successBlock).toContain('setSelectedBankAccountId(created.id)');
    expect(successBlock).toContain("setNewBankAccountName('')");
    expect(successBlock).toContain("setNewBankAccountNumber('')");
    expect(successBlock).toContain("setNewBankOpeningBalance('')");
    expect(successBlock).toContain('getGetJointAccountsQueryKey()');

    for (const draftSetter of [
      'setAmount(',
      'setCategory(',
      'setCategoryAllocations(',
      'setDescription(',
      'setNotes(',
      'setDate(',
      'setIsRecurring(',
      'setPaidById(',
      'setSelectedSources(',
      'setSplitAmounts(',
      'setPaidFromBank(',
      'setAllowMixedFunding(',
    ]) {
      expect(successBlock).not.toContain(draftSetter);
      expect(errorBlock).not.toContain(draftSetter);
    }
  });

  it('prompts the user to categorize editable uncategorized expenses from Home', () => {
    expect(homeSource).toContain('isUncategorizedExpense');
    expect(homeSource).toContain('testID="uncategorized-expense-cta"');
    expect(homeSource).toContain('waiting for a category');
    expect(homeSource).toContain('Categorize now');
    expect(homeSource).toContain('router.push(getExpenseEditHref(expense)');
  });

  it('keeps full bank amounts on one line on the Home dashboard', () => {
    const bankCard = homeSource.slice(
      homeSource.indexOf('{/* Bank Account Balance Card */}'),
      homeSource.indexOf('{isSharedWorkspace && (', homeSource.indexOf('{/* Bank Account Balance Card */}')),
    );
    const bankStats = bankCard.slice(0, bankCard.indexOf('{bankAccount && bankAccount.balance === 0'));

    expect(bankStats).toContain('`KES ${formatKES(bankAccount.balance)}`');
    expect(bankStats).toContain('`+KES ${formatKES(monthlyDeposited)}`');
    expect(bankStats).toContain('`-KES ${formatKES(monthlyDisbursed)}`');
    expect(bankStats).not.toContain('shortKES(');
    expect(bankStats.match(/numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.65\}/g)).toHaveLength(3);
    expect(homeSource).toContain("bankBalance: { width: '100%', flexShrink: 1, textAlign: 'center'");
    expect(homeSource).toContain("bankStatValue: { width: '100%', flexShrink: 1, textAlign: 'center'");
  });

  it('explains categories and offers a clearly named one-off option below them', () => {
    expect(source).toContain('CATEGORY (OPTIONAL)');
    expect(source).toContain('Leave this blank to save the expense as Uncategorized, outside any budget category.');
    expect(source).toContain("onPress={() => chooseCategory('Other')}");
    expect(source).toContain('testID="one-off-spending-category"');
    expect(source).toContain('Use this as the last category when part of the expense does not fit any listed category.');
  });

  it('keeps allocation controls for deliberate category selection only', () => {
    expect(source).toContain('{categoryAllocations.length > 0 && (');
    expect(source).toContain('testID="category-allocation-card"');
    expect(source).toContain('testID="add-category-allocation-mobile"');
    expect(source).toContain('testID="add-category-allocation-mobile-disabled"');
    expect(source).toContain('CATEGORY AMOUNTS REQUIRED');
    expect(source).toContain('Enter how much of the expense each category covered.');
    expect(source).toContain('One-off spending amount (KES)');
    expect(source).toContain('allocationAmountLabel');
    expect(source).toContain('placeholder="Enter KES amount"');
  });

  it('requires an explanatory note for one-off spending', () => {
    expect(source).toContain("allocation.category.trim().toLocaleLowerCase() === 'other') && notes.trim().length < 3");
    expect(source).toContain("Add a short note explaining what this one-off expense was for.");
    expect(source).toContain("'NOTES (required for one-off spending)'");
  });

  it('offers explicit uncategorized save and preserves the draft while creating a budget', () => {
    expect(source).toContain("text: 'Save without category'");
    expect(source).toContain("text: 'Create a monthly budget'");
    expect(source).toContain('JSON.stringify({ expenseDraft })');
    expect(source).toContain("params: { recurringSetup: '1', category: description.trim() }");
    expect(budgetSource).toContain('handoff.expenseDraft');
    expect(budgetSource).toContain('categoryName: formName.trim()');
  });

  it('creates the first allocation when an uncategorized expense is recategorized', () => {
    expect(source).toContain("const next = addStandardCategory(previous, name);");
    expect(source).toContain("standard.push({ category: categoryName, amount: '' });");
    expect(source).toContain('.filter((allocation) => allocation.category.trim())');
  });

  it('keeps one-off spending independent from regular category allocations', () => {
    expect(source).toContain('const hasOneOffAllocation = categoryAllocations.some');
    expect(source).toContain('const displayedCategoryAllocations = categoryAllocations;');
    expect(source).toContain('function toggleOneOffCategory(allocations: CategoryAllocation[]): CategoryAllocation[]');
  });

  it('lets uncategorized creates and edits pass allocation validation', () => {
    expect(source).toContain("setCategory(hydratedAllocations[0]?.category ?? '')");
    expect(source).toContain('normalizedAllocations.length > 0 && normalizedAllocations.some(');
    expect(source).toContain('normalizedAllocations.length > 0 && allocatedTotal !== parsed');
    expect(source).toContain("category: normalizedAllocations[0]?.category ?? ''");
    expect(source).toContain('categoryAllocations: expenseAllocations');
  });
});