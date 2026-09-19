import { describe, expect, it } from 'vitest';
import { effectiveBudgets, hasChildren, totalBudget, type BudgetRow } from '@workspace/category-tree';

const row = (id: number, budgetAmount: number, parentId: number | null = null): BudgetRow =>
  ({ id, parentId, budgetAmount });

// Giving Food 20,000 and then Groceries 8,000 under it asked the same question
// twice and counted the answer twice: the total budget was the sum of every
// row, so the pair read as 28,000.
describe('a parent is the sum of its subcategories', () => {
  it('replaces the parent figure with its children', () => {
    const rows = [row(1, 20_000), row(2, 8_000, 1), row(3, 5_000, 1)];
    expect(effectiveBudgets(rows).get(1)).toBe(13_000);
  });

  it('ignores whatever the parent itself was given', () => {
    // The stored number is left alone in the database; it just stops counting.
    expect(effectiveBudgets([row(1, 999_999), row(2, 100, 1)]).get(1)).toBe(100);
  });

  it('leaves a category with no subcategories on its own figure', () => {
    // Which is every category until somebody nests one.
    expect(effectiveBudgets([row(1, 20_000)]).get(1)).toBe(20_000);
  });

  it('keeps each child on its own figure', () => {
    const budgets = effectiveBudgets([row(1, 20_000), row(2, 8_000, 1)]);
    expect(budgets.get(2)).toBe(8_000);
  });

  it('makes a parent whose children are all zero come to zero', () => {
    // "Track this, do not judge it" is a real answer, and it has to be
    // reported honestly rather than falling back to the parent's old number.
    expect(effectiveBudgets([row(1, 20_000), row(2, 0, 1)]).get(1)).toBe(0);
  });

  it('sums only the rows it was given', () => {
    // A caller that has narrowed to one month gets a parent summed from that
    // month's children, not from children that are not active.
    const thisMonth = [row(1, 20_000), row(2, 8_000, 1)];
    expect(effectiveBudgets(thisMonth).get(1)).toBe(8_000);
  });

  it('treats a child whose parent is absent as a category in its own right', () => {
    expect(effectiveBudgets([row(2, 8_000, 99)]).get(2)).toBe(8_000);
  });
});

describe('hasChildren', () => {
  it('knows which rows no longer carry their own figure', () => {
    const rows = [row(1, 20_000), row(2, 8_000, 1)];
    expect(hasChildren(rows, 1)).toBe(true);
    expect(hasChildren(rows, 2)).toBe(false);
  });
});

describe('totalBudget', () => {
  it('counts a parent once, through its children', () => {
    // Summing every row made this 28,000.
    expect(totalBudget([row(1, 20_000), row(2, 8_000, 1)])).toBe(8_000);
  });

  it('adds up plain categories as before', () => {
    expect(totalBudget([row(1, 20_000), row(2, 5_000)])).toBe(25_000);
  });

  it('mixes the two without double counting', () => {
    const rows = [row(1, 20_000), row(2, 8_000, 1), row(3, 5_000, 1), row(4, 7_000)];
    expect(totalBudget(rows)).toBe(20_000); // 8,000 + 5,000 + 7,000
  });

  it('is zero for no categories', () => {
    expect(totalBudget([])).toBe(0);
  });
});
