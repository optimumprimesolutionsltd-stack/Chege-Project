import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/pages/budget.tsx', 'utf8');

// A parent now carries no budget of its own: the API returns its subcategories
// added up. Summing every row on top of that counted each subcategory twice.
describe('the web report totals count a subcategory once', () => {
  it('adds up only the rows nothing is nested under', () => {
    expect(page).toContain('const leafBreakdown = (breakdown ?? []).filter(');
    expect(page).toContain('!(breakdown ?? []).some((other) => other.parentName === item.category)');
  });

  it('uses that list for both the budget and the actual', () => {
    // Spending rolls up to a parent the same way the budget does, so summing
    // every row double counts the spend as well as the budget.
    expect(page).toContain('const reportBudget = leafBreakdown.reduce((sum, item) => sum + item.budgetAmount, 0);');
    expect(page).toContain('const reportActual = leafBreakdown.reduce((sum, item) => sum + item.spentAmount, 0);');
  });
});

describe('the web form matches the phone', () => {
  it('offers no budget field for a category with subcategories', () => {
    expect(page).toContain('data-testid="parent-budget-note"');
    expect(page).toContain('is budgeted through its subcategories');
  });

  it('still offers it for an ordinary category', () => {
    // The note now covers a category declared a group as well as one that has
    // already acquired subcategories: both are budgeted through their
    // children, and only the timing differs.
    expect(page).toContain('{hasChildren || isGroup ? (');
    expect(page).toContain('"Average monthly amount (KES)" : "Budget amount (KES)"');
  });

  it('drops a figure that can no longer be anything but zero', () => {
    // A category's budget IS its ledgers added up now, so the difference
    // between the two is always nothing.
    expect(page).not.toContain('const unallocated = categoryBudgetAmount - allocated;');
    expect(page).not.toContain('Unallocated:');
  });
});

// The server zeroes a parent's own stored budgetAmount the instant it gains a
// child (clearParentBudgetAmount, budget-categories.ts). The main report cards
// already read the server's rolled-up breakdown figures, not that raw column —
// but "Edit existing budgets" and the no-spending-yet cards read allCategories
// directly, and would otherwise print a parent's budget as KES 0.
describe('every raw read of a category list rolls up a parent first', () => {
  it('imports effectiveBudgets and derives a lookup from it', () => {
    expect(page).toContain('import { effectiveBudgets } from "@workspace/category-tree";');
    expect(page).toContain('const effectiveBudgetById = effectiveBudgets(');
    expect(page).toContain('const budgetFor = (category: BudgetCategory) => effectiveBudgetById.get(category.id) ?? category.budgetAmount;');
  });

  it('"Edit existing budgets" shows the rolled-up figure, not the raw column', () => {
    expect(page).toContain('{formatKes(budgetFor(category))} ·');
    expect(page).not.toContain('{formatKes(category.budgetAmount)} ·');
  });

  it('a not-yet-spent parent shows its rolled-up figure too', () => {
    expect(page).toContain('Limit: {formatKes(budgetFor(cat))} · No spending yet');
    expect(page).toContain('categoryBudgetAmount={budgetFor(cat)}');
  });
});
