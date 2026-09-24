import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { filterCategoryTree } from '@workspace/category-tree';

const tree = [
  { name: 'Food', children: ['Groceries', 'Eating out'] },
  { name: 'Transport', children: ['Fuel', 'Matatu'] },
  { name: 'Rent', children: [] },
];

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// "give a quick search button in categories" — on Budget, Banking and Log Expense.
describe('filterCategoryTree', () => {
  it('returns everything for an empty or blank search', () => {
    expect(filterCategoryTree(tree, '')).toEqual(tree);
    expect(filterCategoryTree(tree, '   ')).toEqual(tree);
  });

  it('keeps a whole group when its own name matches', () => {
    expect(filterCategoryTree(tree, 'food')).toEqual([tree[0]]);
  });

  it('keeps only matching subcategories, under their parent', () => {
    expect(filterCategoryTree(tree, 'fu')).toEqual([{ name: 'Transport', children: ['Fuel'] }]);
  });

  it('matches childless categories and ignores case and spaces', () => {
    expect(filterCategoryTree(tree, '  RENT ')).toEqual([tree[2]]);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterCategoryTree(tree, 'zzz')).toEqual([]);
  });
});

describe('the search box is on every category list', () => {
  it.each([
    ['app/(tabs)/bank.tsx', 3],
    ['app/bank-day.tsx', 1],
    ['app/add-expense.tsx', 1],
    ['app/(tabs)/budget.tsx', 1],
  ])('%s', (file, count) => {
    expect(read(file).split('<CategorySearchBox').length - 1).toBe(count);
  });
});
