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

  it('shares one grouped picker between the modes', () => {
    expect(form).toContain('testID={`category-group-${group.name}`}');
    // The badge that advertised a hidden subcategory count is gone with the
    // hidden row: nothing is behind a chip to point at any more.
    expect(form).not.toContain('subcategoryCount={isAdvanced ? children.length : 0}');
  });
});

// Superseded: a category holding subcategories can no longer receive an
// expense at all, so Quick cannot offer only the top level — it would leave a
// nested category unreachable in that mode. Quick lists what is postable.
describe('and says where spending actually lands', () => {
  it('offers the postable categories in Quick, laid out under their headings', () => {
    // They used to sit side by side in one strip labelled "Housing > Rent",
    // which reads as a flat list of oddly-named categories rather than a shape.
    expect(form).toContain('testID={`category-group-${group.name}`}');
    expect(form).toContain('{group.children.map((child) => (');
  });

  it('draws a heading as text, never as a chip', () => {
    // Offering it as one would only invite the tap the server refuses.
    expect(form).toContain('<Text style={[styles.quickGroupHeading,');
    expect(form).not.toContain('const quickChoices = useMemo(');
  });

  it('still offers a top-level category that has no subcategories', () => {
    expect(form).toContain('{group.children.length > 0 ? (');
  });

  it('explains it in both modes', () => {
    expect(form).toContain('A category holding subcategories is a heading');
    expect(form).toContain('spending lands on a subcategory');
  });
});
