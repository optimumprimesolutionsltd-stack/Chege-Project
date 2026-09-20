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
describe('Quick mode offers what can be posted to', () => {
  it('still builds the tree from parents', () => {
    const offered = buildCategoryTree(rows).map((group) => group.name);
    expect(offered).toEqual(['Food', 'Transport']);
  });

  it('keeps the two-stage picker behind Detailed on the phone', () => {
    expect(form).toContain('{isAdvanced && categoryTree');
    // The badge that advertises a subcategory count is Detailed-only too, or
    // Quick would point at a row it cannot open.
    expect(form).toContain('subcategoryCount={isAdvanced ? children.length : 0}');
  });
});

// Superseded: a category holding subcategories can no longer receive an
// expense at all, so Quick cannot offer only the top level — it would leave a
// nested category unreachable in that mode. Quick lists what is postable.
describe('and says where spending actually lands', () => {
  it('offers the postable categories in Quick, not the headings', () => {
    expect(form).toContain('const quickChoices = useMemo(');
    expect(form).toContain('group.children.map((child) => ({ name: child, label: `${group.name} > ${child}` }))');
  });

  it('names the parent alongside a subcategory, for context', () => {
    // "Rent" on its own says less than "Housing > Rent".
    expect(form).toContain('label={label}');
  });

  it('explains it in both modes', () => {
    expect(form).toContain('A category holding subcategories is a heading');
    expect(form).toContain('spending lands on a subcategory');
  });
});
