import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/add-expense.tsx', 'utf8');
const budgetSource = readFileSync('app/(tabs)/budget.tsx', 'utf8');
const homeSource = readFileSync('app/(tabs)/index.tsx', 'utf8');

describe('optional expense category layout', () => {
  it('prompts the user to categorize editable uncategorized expenses from Home', () => {
    expect(homeSource).toContain('isUncategorizedExpense');
    expect(homeSource).toContain('testID="uncategorized-expense-cta"');
    expect(homeSource).toContain('waiting for a category');
    expect(homeSource).toContain('Categorize now');
    expect(homeSource).toContain('router.push(getExpenseEditHref(expense)');
  });

  it('explains categories and offers a clearly named one-off option below them', () => {
    expect(source).toContain('CATEGORY (OPTIONAL)');
    expect(source).toContain('Leave this blank to save the expense as Uncategorized, outside any budget category.');
    expect(source).toContain("onPress={() => chooseCategory('Other')}");
    expect(source).toContain('testID="one-off-spending-category"');
    expect(source).toContain('Use this for a one-time expense that does not fit any listed category. Add a note below.');
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
    expect(source).toContain("const standardAllocations = previous.filter");
    expect(source).toContain("const next = [...standardAllocations, { category: name, amount: '' }];");
    expect(source).toContain('.filter((allocation) => allocation.category.trim())');
  });

  it('keeps one-off spending independent from regular category allocations', () => {
    expect(source).toContain("return [{ category: 'Other', amount: existingOneOff?.amount ?? '' }]");
    expect(source).toContain('const displayedCategoryAllocations = hasOneOffAllocation');
    expect(source).toContain('{!hasOneOffAllocation && <Pressable');
  });

  it('lets uncategorized creates and edits pass allocation validation', () => {
    expect(source).toContain("setCategory(hydratedAllocations[0]?.category ?? '')");
    expect(source).toContain('normalizedAllocations.length > 0 && normalizedAllocations.some(');
    expect(source).toContain('normalizedAllocations.length > 0 && allocatedTotal !== parsed');
    expect(source).toContain("category: normalizedAllocations[0]?.category ?? ''");
    expect(source).toContain('categoryAllocations: expenseAllocations');
  });
});