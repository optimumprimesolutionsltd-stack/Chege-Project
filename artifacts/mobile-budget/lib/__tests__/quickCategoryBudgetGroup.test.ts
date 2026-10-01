import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const screen = readFileSync('app/mpesa-import.tsx', 'utf8');

// "Should be able to have a budget for a new subcategory, and create a new parent."
describe('adding a category while choosing one', () => {
  it('takes a monthly budget for the new category', () => {
    expect(screen).toContain('testID="mpesa-category-new-budget"');
    expect(screen).toContain("const budgetAmount = newBudget.trim() === '' ? 0 : Math.round(Number(newBudget.replace(/[^0-9.]/g, '')));");
  });

  it('can make a new group and put the category inside it', () => {
    expect(screen).toContain("{ id: NEW_GROUP as number | null, name: '＋ New group' }");
    expect(screen).toContain('testID="mpesa-category-new-group"');
    expect(screen).toContain('data: { name: groupName, budgetAmount: 0, priority: 3, isRecurring: true, activeMonth: null, activeYear: null },');
  });

  it('says so when a group’s own budget will become its subcategories’', () => {
    expect(screen).toContain('testID="mpesa-category-parent-budget-note"');
    expect(screen).toContain("A group's budget is its subcategories added up, so it will become what you give this one.");
  });
});
