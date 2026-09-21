import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mobile = readFileSync('app/(tabs)/budget.tsx', 'utf8');

// Every new category was asked for a budget figure, including one meant as a
// heading — and that figure was then quietly replaced by the children's total
// the moment a subcategory arrived. A number invited and then discarded.
describe('a category can say it is a group', () => {
  it('asks what kind of thing it is', () => {
    expect(mobile).toContain('WHAT IS THIS?');
    expect(mobile).toContain("testID: 'category-kind-group'");
    expect(mobile).toContain("testID: 'category-kind-ledger'");
  });

  it('asks before the budget, the answer deciding whether a budget applies', () => {
    expect(mobile.indexOf('WHAT IS THIS?')).toBeLessThan(mobile.indexOf("'AVERAGE MONTHLY AMOUNT (KES)' : 'BUDGET AMOUNT (KES)'"));
  });

  it('shows a group the same note an existing heading gets', () => {
    expect(mobile).toContain('{editingParent || formIsGroup ? (');
    expect(mobile).toContain('is budgeted through its subcategories');
  });

  it('sends nothing for a group to hold', () => {
    expect(mobile).toContain('budgetAmount: formIsGroup ? 0 : amt,');
  });

  it('keeps a group at the top level', () => {
    // Nesting goes one level deep, so a group cannot itself sit inside one.
    expect(mobile).toContain('parentId: formIsGroup ? null : formParentId,');
    expect(mobile).toContain('{!editingParent && !formIsGroup && !recurringSetupActive ? (');
  });

  it('does not refuse a group for having no amount', () => {
    // The field is not shown, so there is nothing to have entered.
    expect(mobile).toContain('if (!formIsGroup && (isNaN(amt) || amt < 0)) {');
  });

  it('never asks a category that already has subcategories', () => {
    // It is a group already, and answering otherwise would orphan them.
    expect(mobile).toContain('{!editingParent && !recurringSetupActive ? (');
  });

  it('opens on the truth when editing', () => {
    expect(mobile).toContain('setFormIsGroup(allCategories.some((row) => row.parentId === cat.id));');
  });
});
