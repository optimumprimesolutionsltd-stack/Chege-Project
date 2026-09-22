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

  it('borrows the income row styles for its inputs', () => {
    // Looking like it is the point: somebody recognised that row.
    // Three: income, the category row, and the parent picker beneath it.
    expect((budget.match(/styles\.incomeAddRow/g) ?? []).length).toBe(3);
  });

  it('puts the action after every input, not above one of them', () => {
    // The plus sat in the first row, above the parent picker, so pressing
    // it before reaching "Inside …" made exactly the top-level category
    // this row exists to stop somebody making by accident.
    expect(budget.indexOf('testID="budget-new-category-parent"')).toBeLessThan(
      budget.indexOf('testID="budget-new-category-add"'),
    );
    expect(budget).toContain('styles.quickAddAction');
  });

  it('says where it will go, on the button itself', () => {
    expect(budget).toContain("{chosenParent ? `Add inside ${chosenParent.name}` : 'Add category'}");
  });

  it('cannot be pressed with nothing to add', () => {
    expect(budget).toContain("disabled={addingCategory || newCategoryName.trim() === ''}");
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
    expect(budget).toContain('Tier, or a one-month category? Open the full form');
  });

  it('sends whichever parent was chosen, top level being one of them', () => {
    expect(budget).toContain('parentId: newCategoryParentId,');
  });
});

// Creating Rent at the top level when it belonged under Housing is the wrong
// creation the quick row was making easy: it asked for a name and an amount
// and never for where the category goes.
describe('the quick row asks where the category goes', () => {
  it('offers a parent, defaulting to its own category', () => {
    expect(budget).toContain('testID="budget-new-category-parent"');
    expect(budget).toContain('testID="budget-new-category-parent-none"');
    expect(budget).toContain("{chosenParent ? `Inside ${chosenParent.name}` : 'Its own category'}");
  });

  it('offers only top-level categories, nesting being one deep', () => {
    // A subcategory offered as a parent would make a category the app then
    // refuses to save.
    expect(budget).toContain('const eligibleParents = useMemo(');
    expect(budget).toContain('allCategories.filter((row) => !row.parentId)');
    expect(budget).toContain('Nesting goes one level deep.');
  });

  it('says so when there is nothing to nest under yet', () => {
    expect(budget).toContain('Nothing to nest under yet.');
  });

  it('warns before turning a funded category into a heading', () => {
    // A heading totals its children and holds nothing of its own, so the
    // parent's amount is about to become a total rather than a budget.
    expect(budget).toContain('testID="budget-parent-becomes-heading"');
    expect(budget).toContain('makes it a heading, and its budget becomes the total of what is inside');
  });

  it('keeps the parent between additions', () => {
    // Adding three subcategories to one heading is the common case.
    // Cleared in one place only: the "Its own category" option. Never on a
    // successful add, where adding three under one heading is the common case.
    expect((budget.match(/setNewCategoryParentId\(null\)/g) ?? []).length).toBe(1);
  });
});
