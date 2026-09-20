import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const form = readFileSync('app/add-expense.tsx', 'utf8');
const budget = readFileSync('app/(tabs)/budget.tsx', 'utf8');

// Quick cannot create a category — that is what makes it the fast path. But a
// budget with none was a dead end: nothing to spend on, and no way out of the
// screen. Deleting a workspace's categories put somebody straight into it.
describe('an empty budget offers a way out of Quick', () => {
  it('replaces the dead-end sentence with a door', () => {
    expect(form).toContain('testID="quick-setup-categories"');
    expect(form).toContain('No categories yet. Set up your categories');
  });

  it('keeps what was already typed', () => {
    // Sending somebody away mid-expense and losing the amount they typed is
    // how a half-finished expense gets abandoned.
    expect(form).toContain('await AsyncStorage.setItem(RECURRING_BUDGET_HANDOFF_KEY, JSON.stringify({ expenseDraft }));');
    expect(form).toContain("router.push({ pathname: '/(tabs)/budget', params: { setupCategories: '1' } });");
  });

  it('offers it only to somebody who can act on it', () => {
    // A member who cannot manage categories gets told to ask, not offered a
    // button that leads to a form they may not be allowed to use.
    expect(form).toContain('isAdvanced || !canManageCategories ? (');
    expect(form).toContain("'No categories are available. Ask a budget manager to add one.'");
  });

  it('leaves Detailed as it was, since it can already create one', () => {
    expect(form).toContain("'No categories yet. Create one below before you can save this expense.'");
  });
});

describe('and hands the person back afterwards', () => {
  it('opens the create form on arrival rather than making them find it', () => {
    expect(budget).toContain('setupCategories?: string | string[];');
    expect(budget).toContain("const wanted = Array.isArray(params.setupCategories) ? params.setupCategories[0] : params.setupCategories;");
    expect(budget).toContain('openAdd(1);');
  });

  it('returns to the expense once the category is saved', () => {
    expect(budget).toContain('if (returnToExpense) {');
    expect(budget).toContain("router.push('/add-expense');");
  });

  it('returns from the recurring-budget detour too, which never did', () => {
    // That flow handed a draft over and then stranded the person on this
    // screen; the draft only reloaded if they happened to reopen the form.
    const recurring = budget.slice(budget.indexOf("const setup = Array.isArray(params.recurringSetup)"));
    expect(recurring.slice(0, 400)).toContain('setReturnToExpense(true);');
  });

  it('only returns once, so a later save stays put', () => {
    expect(budget).toContain('setReturnToExpense(false);');
  });

  it('names the new category so the form can select it on arrival', () => {
    // Otherwise the person lands back on their draft and still has to find the
    // thing they just created, which is most of the trip repeated.
    expect(budget).toContain('if (recurringSetupActive || returnToExpense) {');
    expect(budget).toContain('{ ...handoff, categoryName: formName.trim() }');
  });
});
