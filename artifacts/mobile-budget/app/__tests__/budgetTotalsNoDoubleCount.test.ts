import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { effectiveBudgets } from '@workspace/category-tree';

const budget = readFileSync('app/(tabs)/budget.tsx', 'utf8');

// #222 made a parent's figures its subcategories added up — budget and
// spending both. The web totals were corrected for that; the phone's were not,
// so the headline at the top of the Budget tab counted every subcategory twice
// the moment anybody nested one.
describe('the month headline counts a subcategory once', () => {
  it('adds up only the rows nothing is nested under', () => {
    expect(budget).toContain('const leafBreakdown = breakdown.filter(');
    expect(budget).toContain('!breakdown.some((other) => other.parentName === category.category)');
  });

  it('uses that list for the budget and the actual alike', () => {
    // Spending rolls up to a parent the same way the budget does.
    expect(budget).toContain('const reportBudget = leafBreakdown.reduce((sum, category) => sum + category.budgetAmount, 0);');
    expect(budget).toContain('const reportActual = leafBreakdown.reduce((sum, category) => sum + category.spentAmount, 0);');
  });

  it('uses it per priority tier too', () => {
    // A parent and its children can sit in different tiers, and the money is
    // budgeted on the children.
    expect(budget).toContain('const reported = leafBreakdown.filter(category => category.priority === tier);');
  });
});

// The manage list and the unused-category list read straight from
// /budget-categories, where a parent's stored amount is cleared to 0.
describe('a list reading the stored rows still shows the real figure', () => {
  it('derives a parent figure rather than printing the stored zero', () => {
    expect(budget).toContain('const storedBudgets = effectiveBudgets(');
    expect(budget).toContain('const budgetFor = (category: BudgetCategory) => storedBudgets.get(category.id) ?? category.budgetAmount;');
  });

  it('uses it everywhere such a row is drawn', () => {
    for (const site of [
      'KES {formatKES(budgetFor(category))} · {category.isRecurring',
      'KES {formatKES(budgetFor(ledgerBudgetCategory))}',
      '/ {formatKES(budgetFor(cat))}',
    ]) {
      expect(budget).toContain(site);
    }
  });

  it('counts a parent as budgeted when only its children hold the figure', () => {
    // Otherwise Food drops out of the summary the moment its own amount is
    // cleared, and "open the one budgeted category" picks the wrong one.
    expect(budget).toContain('activeCategories.filter(category => budgetFor(category) > 0)');
  });

  it('leaves no render reading budgetAmount off a stored row directly', () => {
    // The breakdown rows are already correct; these are the raw ones.
    expect(budget).not.toContain('formatKES(category.budgetAmount)');
    expect(budget).not.toContain('formatKES(ledgerBudgetCategory.budgetAmount)');
  });
});

describe('the rule itself', () => {
  it('reports a parent as the sum of its children, not its stored figure', () => {
    const budgets = effectiveBudgets([
      { id: 1, parentId: null, budgetAmount: 0 },      // Food, cleared
      { id: 2, parentId: 1, budgetAmount: 8_000 },     // Groceries
      { id: 3, parentId: 1, budgetAmount: 5_000 },     // Dining
      { id: 4, parentId: null, budgetAmount: 7_000 },  // Transport
    ]);
    expect(budgets.get(1)).toBe(13_000);
    expect(budgets.get(4)).toBe(7_000);
  });
});
