import { describe, expect, it } from 'vitest';
import { buildCategoryTree, parentOf, type CategoryRow } from '../categoryPicker';

const FOOD: CategoryRow = { id: 1, name: 'Food', parentId: null };
const GROCERIES: CategoryRow = { id: 2, name: 'Groceries', parentId: 1 };
const VEGETABLES: CategoryRow = { id: 3, name: 'Vegetables', parentId: 1 };
const HOUSING: CategoryRow = { id: 4, name: 'Housing', parentId: null };
const OTHER: CategoryRow = { id: 5, name: 'Other', parentId: null };

describe('buildCategoryTree', () => {
  it('keeps subcategories under their parent instead of alongside it', () => {
    const tree = buildCategoryTree([FOOD, HOUSING, GROCERIES, VEGETABLES]);
    expect(tree).toEqual([
      { name: 'Food', children: ['Groceries', 'Vegetables'] },
      { name: 'Housing', children: [] },
    ]);
  });

  it('offers only top-level names at the top level, which is all Quick mode renders', () => {
    const tree = buildCategoryTree([FOOD, GROCERIES, VEGETABLES, HOUSING]);
    expect(tree.map((group) => group.name)).toEqual(['Food', 'Housing']);
  });

  it('drops "Other" everywhere, including as a parent', () => {
    const child: CategoryRow = { id: 6, name: 'Misc', parentId: OTHER.id };
    const tree = buildCategoryTree([OTHER, FOOD, child]);
    expect(tree.map((group) => group.name)).not.toContain('Other');
    // Its child is still selectable, just not nested under a dropped parent.
    expect(tree).toContainEqual({ name: 'Misc', children: [] });
  });

  it('treats a category whose parent does not exist in the list as top-level', () => {
    const orphan: CategoryRow = { id: 7, name: 'Orphan', parentId: 999 };
    expect(buildCategoryTree([orphan])).toEqual([{ name: 'Orphan', children: [] }]);
  });

  it('returns an empty list for no categories', () => {
    expect(buildCategoryTree([])).toEqual([]);
  });
});

describe('parentOf', () => {
  const tree = buildCategoryTree([FOOD, GROCERIES, VEGETABLES, HOUSING]);

  it('names the parent a subcategory sits under', () => {
    expect(parentOf(tree, 'Groceries')).toBe('Food');
  });

  it('returns null for a top-level category', () => {
    expect(parentOf(tree, 'Housing')).toBeNull();
  });

  it('returns null for a category that is not in the tree at all', () => {
    expect(parentOf(tree, 'Nonsense')).toBeNull();
    expect(parentOf(tree, '   ')).toBeNull();
  });
});
