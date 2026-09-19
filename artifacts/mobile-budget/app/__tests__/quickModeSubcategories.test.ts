import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCategoryTree, type CategoryRow } from '@workspace/category-tree';

const form = readFileSync('app/add-expense.tsx', 'utf8');
const web = readFileSync('../family-budget/src/pages/expenses.tsx', 'utf8');

const rows: CategoryRow[] = [
  { id: 1, name: 'Food', parentId: null },
  { id: 2, name: 'Groceries', parentId: 1 },
  { id: 3, name: 'Transport', parentId: null },
];

// Quick is meant to be one tap on one category. A subcategory is a refinement,
// and offering it there turns a two-second entry into a decision.
describe('Quick mode offers parents only', () => {
  it('never puts a subcategory among the options', () => {
    const offered = buildCategoryTree(rows).map((group) => group.name);
    expect(offered).toEqual(['Food', 'Transport']);
    expect(offered).not.toContain('Groceries');
  });

  it('keeps the subcategory row behind Detailed on the phone', () => {
    expect(form).toContain('{isAdvanced && categoryTree');
    // The badge that advertises a subcategory count is Detailed-only too, or
    // Quick would point at a row it cannot open.
    expect(form).toContain('subcategoryCount={isAdvanced ? children.length : 0}');
  });
});

describe('and says so, rather than leaving it to be discovered', () => {
  it('tells someone in Quick where the subcategories are', () => {
    expect(form).toContain('Choose the one category this expense belongs to. Subcategories live in Detailed.');
  });

  it('says the same thing on the web', () => {
    expect(web).toContain('Subcategories live in Detailed.');
  });

  it('still explains the refinement in Detailed', () => {
    expect(form).toContain('Pick one, then narrow it with a subcategory if you want to.');
  });
});
