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
