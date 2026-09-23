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
    expect(budget).toContain("budgetAmount: newCategoryIsGroup || raw === '' ? 0 : Number(raw),");
  });

  it('checks the amount is a number', () => {
    expect(budget).toContain("if (!newCategoryIsGroup && raw !== '' && !/^");
  });
});

// The quick row asked for an amount even when the category being made was
// clearly meant to hold subcategories rather than money of its own — the
// only way around it was typing something and letting it get silently
// zeroed out later by putting a category inside it.
describe('a new category can say up front that it is a group', () => {
  it('offers the same choice the full form already has, but only for a new top-level category', () => {
    // "A spending category" read as "this is a child" to somebody who had
    // just been asked whether it's inside a group — renamed to make plain
    // that carrying its own amount and being nested are unrelated questions.
    expect(budget).toContain("{ key: false, label: 'A regular category', testID: 'budget-new-category-kind-ledger' }");
    expect(budget).toContain("{ key: true, label: 'A group of categories', testID: 'budget-new-category-kind-group' }");
    expect(budget).toContain('{!chosenParent ? (');
  });

  it('hides the amount field entirely rather than leaving it optional and confusing', () => {
    expect(budget).toContain('{!newCategoryIsGroup ? (');
  });

  it('forces the amount to zero no matter what was typed before switching', () => {
    expect(budget).toContain('newCategoryIsGroup || raw === \'\'');
  });

  it('clears itself the moment an actual parent is chosen, since nesting always makes a leaf', () => {
    expect(budget).toContain('setNewCategoryParentId(row.id); setNewCategoryIsGroup(false);');
  });

  it('resets after a successful add, the same as the name and amount fields do', () => {
    const handler = budget.slice(budget.indexOf('const handleAddCategoryInline'), budget.indexOf('const handleAddIncomeSource'));
    expect(handler).toContain('setNewCategoryIsGroup(false);');
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
  it('offers a parent, defaulting to not being inside one', () => {
    // "Its own category" used to sit right under "A regular category" /
    // "A group of categories" with no label of its own, reading as a third
    // option in that set rather than the answer to a separate question
    // (what kind vs. where it goes) — renamed so the two cannot be confused.
    expect(budget).toContain('testID="budget-new-category-parent"');
    expect(budget).toContain('testID="budget-new-category-parent-none"');
    expect(budget).toContain("{chosenParent ? `Inside ${chosenParent.name}` : 'Not inside a group'}");
    expect(budget).not.toContain('Its own category');
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
    // Cleared in one place only: the "Not inside a group" option. Never on a
    // successful add, where adding three under one heading is the common case.
    expect((budget.match(/setNewCategoryParentId\(null\)/g) ?? []).length).toBe(1);
  });
});
