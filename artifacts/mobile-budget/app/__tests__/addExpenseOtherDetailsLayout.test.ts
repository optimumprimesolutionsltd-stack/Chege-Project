import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/add-expense.tsx', 'utf8');
const budgetSource = readFileSync('app/(tabs)/budget.tsx', 'utf8');

describe('optional expense category layout', () => {
  it('explains that categories are optional without offering Other as an intermediate category', () => {
    expect(source).toContain('CATEGORY (OPTIONAL)');
    expect(source).toContain('You can also save without one and categorize it later.');
    expect(source).not.toContain("chooseCategory('Other')");
  });

  it('keeps allocation controls for deliberate category selection only', () => {
    expect(source).toContain('{categoryAllocations.length > 0 && (');
    expect(source).toContain('testID="category-allocation-card"');
    expect(source).toContain('testID="add-category-allocation-mobile"');
    expect(source).toContain('CATEGORY AMOUNT REQUIRED');
    expect(source).toContain('Enter the amount covered by each selected category.');
    expect(source).toContain('placeholder="Enter amount"');
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
    expect(source).toContain("const next = [...previous, { category: name, amount: '' }];");
    expect(source).toContain('.filter((allocation) => allocation.category.trim())');
  });

  it('lets uncategorized creates and edits pass allocation validation', () => {
    expect(source).toContain("setCategory(hydratedAllocations[0]?.category ?? '')");
    expect(source).toContain('normalizedAllocations.length > 0 && normalizedAllocations.some(');
    expect(source).toContain('normalizedAllocations.length > 0 && allocatedTotal !== parsed');
    expect(source).toContain("category: normalizedAllocations[0]?.category ?? ''");
    expect(source).toContain('categoryAllocations: expenseAllocations');
  });
});