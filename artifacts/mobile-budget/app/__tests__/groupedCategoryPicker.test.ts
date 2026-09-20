import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const form = readFileSync('app/add-expense.tsx', 'utf8');

// Detailed used to hide subcategories behind heading chips. A branch holding
// part of the expense and the branch you were looking inside were filled
// identically, so two chips lit up with no way to tell what either meant.
// Superseded oneOpenHeading.test.ts, which pinned the two-stage picker.
describe('both modes lay the categories out under their headings', () => {
  it('renders one grouped list rather than a picker per mode', () => {
    expect(form).toContain('{!categoriesQuery.isLoading && !categoriesQuery.isError && categoryTree.length > 0 ? (');
    expect(form).toContain('testID={`category-group-${group.name}`}');
  });

  it('draws a heading as text, never as something tappable', () => {
    // A heading cannot hold an expense, so a chip would only invite the tap
    // the server refuses.
    expect(form).toContain('<Text style={[styles.quickGroupHeading,');
    expect(form).not.toContain('subcategoryCount={isAdvanced ? children.length : 0}');
  });

  it('keeps a top-level category with no subcategories selectable', () => {
    expect(form).toContain('{group.children.length > 0 ? (');
  });

  it('refines within a branch in Detailed, and replaces outright in Quick', () => {
    // That difference is what lets Detailed split an expense across
    // categories while Quick stays one tap.
    expect(form).toContain('onSelect={isAdvanced ? chooseSubcategory : chooseCategory}');
  });
});

describe('and the two-stage machinery is gone rather than left dangling', () => {
  it('drops the state that only drove the hidden row', () => {
    for (const dead of ['openHeading', 'activeHeading', 'selectedParents']) {
      expect(form).not.toContain(dead);
    }
  });

  it('still refuses to select a heading, in case something calls it', () => {
    expect(form).toContain('if (headings.has(name)) return;');
  });

  it('no longer renders a separate subcategory row', () => {
    expect(form).not.toContain('testID={`subcategory-row-${group.name}`}');
    expect(form).not.toContain('Choose a ${group.name} subcategory');
  });
});

describe('Quick keeps a route to creating one', () => {
  it('offers it whether or not the budget already has categories', () => {
    // The door used to appear only when the budget was completely empty, so
    // anybody with categories and a missing one had no route at all.
    expect(form).toContain('testID="quick-add-category"');
    expect(form).toContain('{!isAdvanced && canManageCategories && categoryTree.length > 0 ? (');
  });

  it('still creates nothing in Quick itself', () => {
    // It hands over to the Budget tab with the draft, and comes back.
    expect(form).toContain("router.push({ pathname: '/(tabs)/budget', params: { setupCategories: '1' } });");
    expect(form).toContain('{isAdvanced && canManageCategories && !isCreatingCategory && (');
  });
});
