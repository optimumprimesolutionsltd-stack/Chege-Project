import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const budget = readFileSync('app/(tabs)/budget.tsx', 'utf8');

// There was a plus in the header, clipped off the edge on a narrow phone, and
// an Add inside each tier group, which somebody has to already know what a
// tier is to find. Neither reads as "make a category". The one place on this
// screen that plainly does is the income row, so this matches it.
describe('a category can be added the way an income stream is', () => {
  it('sits in its own section, above income streams', () => {
    expect(budget).toContain('testID="budget-category-quick-add"');
    expect(budget).toContain('Budget categories');
    expect(budget.indexOf('Budget categories')).toBeLessThan(budget.indexOf('Income streams'));
  });

  it('is a name, an amount and a plus — the same three controls', () => {
    expect(budget).toContain('testID="budget-new-category-name"');
    expect(budget).toContain('testID="budget-new-category-amount"');
    expect(budget).toContain('testID="budget-new-category-add"');
  });

  it('borrows the income row styles rather than inventing new ones', () => {
    // Looking like it is the point: somebody recognised that row.
    expect((budget.match(/styles\.incomeAddRow/g) ?? []).length).toBe(2);
    expect((budget.match(/styles\.incomeAddButton/g) ?? []).length).toBe(2);
  });

  it('takes the keyboard return as well as the button', () => {
    expect(budget).toContain('onSubmitEditing={() => void handleAddCategoryInline()}');
  });
});

describe('what the quick row refuses', () => {
  it('insists on a name', () => {
    expect(budget).toContain("Alert.alert('Category name required'");
  });

  it('refuses a duplicate rather than letting the server do it', () => {
    expect(budget).toContain("Alert.alert('That category already exists'");
  });

  it('lets the amount be left for later', () => {
    expect(budget).toContain("budgetAmount: raw === '' ? 0 : Number(raw),");
  });

  it('checks the amount is a number', () => {
    expect(budget).toContain("if (raw !== '' && !/^");
  });
});

describe('the full form is still there for the rest', () => {
  it('is offered by name, under the quick row', () => {
    expect(budget).toContain('testID="budget-open-full-category-form"');
    expect(budget).toContain('Subcategory, tier or a one-month category? Open the full form');
  });

  it('makes a plain top-level category, leaving the rest to that form', () => {
    expect(budget).toContain('parentId: null,');
  });
});
