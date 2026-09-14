import { describe, expect, it } from 'vitest';
import { groupCategoriesForPicker, type CategoryRow } from '../categoryPicker';

const FOOD: CategoryRow = { id: 1, name: 'Food', parentId: null };
const GROCERIES: CategoryRow = { id: 2, name: 'Groceries', parentId: 1 };
const VEGETABLES: CategoryRow = { id: 3, name: 'Vegetables', parentId: 1 };
const HOUSING: CategoryRow = { id: 4, name: 'Housing', parentId: null };
const OTHER: CategoryRow = { id: 5, name: 'Other', parentId: null };

describe('groupCategoriesForPicker', () => {
  it('places each subcategory immediately after its parent, preserving relative order otherwise', () => {
    const rows = [FOOD, HOUSING, GROCERIES, VEGETABLES];
    const entries = groupCategoriesForPicker(rows);
    expect(entries.map((e) => e.name)).toEqual(['Food', 'Groceries', 'Vegetables', 'Housing']);
  });

  it('labels a subcategory with its parent name, but keeps the selectable value plain', () => {
    const entries = groupCategoriesForPicker([FOOD, GROCERIES]);
    const groceries = entries.find((e) => e.name === 'Groceries');
    expect(groceries).toEqual({ name: 'Groceries', label: 'Food: Groceries' });
  });

  it('leaves a top-level category with no children labeled as itself', () => {
    const entries = groupCategoriesForPicker([HOUSING]);
    expect(entries).toEqual([{ name: 'Housing', label: 'Housing' }]);
  });

  it('drops "Other" everywhere, including as a parent', () => {
    const child = { id: 6, name: 'Misc', parentId: OTHER.id };
    const entries = groupCategoriesForPicker([OTHER, FOOD, child]);
    expect(entries.map((e) => e.name)).not.toContain('Other');
    // Its child is still selectable, just not labeled under a dropped parent.
    expect(entries.find((e) => e.name === 'Misc')).toEqual({ name: 'Misc', label: 'Misc' });
  });

  it('treats a category whose parent does not exist in the list as top-level', () => {
    const orphan = { id: 7, name: 'Orphan', parentId: 999 };
    const entries = groupCategoriesForPicker([orphan]);
    expect(entries).toEqual([{ name: 'Orphan', label: 'Orphan' }]);
  });

  it('returns an empty list for no categories', () => {
    expect(groupCategoriesForPicker([])).toEqual([]);
  });
});
