import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const form = readFileSync('app/add-expense.tsx', 'utf8');
const web = readFileSync('../family-budget/src/pages/expenses.tsx', 'utf8');

// Detailed opened a subcategory row under every selected parent. With Housing
// and Food both picked, two lists of subcategories stacked up and nothing said
// which one a tap belonged to. Splitting an expense across categories is still
// allowed — the choosing just happens one branch at a time.
describe('one branch of subcategories is open at a time', () => {
  it('renders the row for a single active heading', () => {
    expect(form).toContain('.filter((group) => group.name === activeHeading && group.children.length > 0)');
    expect(form).not.toContain('(selectedParents.has(group.name) || openHeading === group.name) && group.children.length > 0');
  });

  it('falls back to the branch the last choice came from', () => {
    // So a restored draft still shows where its category lives, rather than
    // opening nothing until something is tapped.
    expect(form).toContain('const last = categoryAllocations[categoryAllocations.length - 1]?.category;');
    expect(form).toContain('return last ? parentOf(categoryTree, last) : null;');
  });

  it('stays in the branch just used', () => {
    // Otherwise the row jumps to another heading that happens to be selected.
    const handler = form.slice(form.indexOf('const chooseSubcategory = useCallback'));
    expect(handler.slice(0, 900)).toContain('setOpenHeading(parent);');
  });

  it('still allows an expense across several categories', () => {
    // The rule is about where the picker is, not about how many categories an
    // expense may have.
    expect(form).toContain('addStandardCategory');
    expect(form).toContain('Add another category');
  });

  it('leaves the parent chips multi-selectable', () => {
    expect(form).toContain('selected={selectedParents.has(name) || openHeading === name}');
  });
});

describe('the web already did this', () => {
  it('derives one parent rather than a row per selection', () => {
    expect(web).toContain('const selectedParentCategory = parentOf(categoryTree, form.category) ?? form.category;');
  });
});
