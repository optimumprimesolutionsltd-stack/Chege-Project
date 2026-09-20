import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/add-expense.tsx', 'utf8');
// The save rules moved into a pure module that these behaviours are now tested
// against directly; see lib/__tests__/expenseValidation.test.ts.
const rules = readFileSync('lib/expenseValidation.ts', 'utf8');
const budgetSource = readFileSync('app/(tabs)/budget.tsx', 'utf8');
const homeSource = readFileSync('app/(tabs)/index.tsx', 'utf8');

describe('optional expense category layout', () => {
  it('creates a bank account inline without resetting the expense draft', () => {
    const handler = source.slice(
      source.indexOf('const handleCreateBankAccount = useCallback'),
      source.indexOf('const chooseCategory = useCallback'),
    );
    const successBlock = handler.slice(handler.indexOf('const created ='), handler.indexOf('} catch (error)'));
    const errorBlock = handler.slice(handler.indexOf('} catch (error)'), handler.indexOf('}, [createBankAccount'));

    expect(successBlock).toContain('setSelectedBankAccountId(created.id)');
    expect(successBlock).toContain("setNewBankAccountName('')");
    expect(successBlock).toContain("setNewBankAccountNumber('')");
    expect(successBlock).toContain("setNewBankOpeningBalance('')");
    expect(successBlock).toContain('getGetJointAccountsQueryKey()');

    for (const draftSetter of [
      'setAmount(',
      'setCategory(',
      'setCategoryAllocations(',
      'setDescription(',
      'setNotes(',
      'setDate(',
      'setIsRecurring(',
      'setPaidById(',
      'setSelectedSources(',
      'setSplitAmounts(',
      'setPaidFromBank(',
      'setAllowMixedFunding(',
    ]) {
      expect(successBlock).not.toContain(draftSetter);
      expect(errorBlock).not.toContain(draftSetter);
    }
  });

  it('prompts the user to categorize editable uncategorized expenses from Home', () => {
    expect(homeSource).toContain('isUncategorizedExpense');
    expect(homeSource).toContain('testID="uncategorized-expense-cta"');
    expect(homeSource).toContain('waiting for a category');
    expect(homeSource).toContain('Categorize now');
    expect(homeSource).toContain('router.push(getExpenseEditHref(expense)');
  });

  it('keeps full bank amounts on one line on the Home dashboard', () => {
    const bankCard = homeSource.slice(
      homeSource.indexOf('{/* Bank Account Balance Card */}'),
      homeSource.indexOf('{isSharedWorkspace && (', homeSource.indexOf('{/* Bank Account Balance Card */}')),
    );
    const bankStats = bankCard.slice(0, bankCard.indexOf('{bankAccount && bankAccount.balance === 0'));

    expect(bankStats).toContain('`KES ${formatKES(bankAccount.balance)}`');
    expect(bankStats).toContain('`+KES ${formatKES(monthlyDeposited)}`');
    expect(bankStats).toContain('`-KES ${formatKES(monthlyDisbursed)}`');
    expect(bankStats).not.toContain('shortKES(');
    expect(bankStats.match(/numberOfLines=\{1\} adjustsFontSizeToFit minimumFontScale=\{0\.65\}/g)).toHaveLength(3);
    expect(homeSource).toContain("bankBalance: { width: '100%', flexShrink: 1, textAlign: 'center'");
    expect(homeSource).toContain("bankStatValue: { width: '100%', flexShrink: 1, textAlign: 'center'");
  });

  it('explains categories and offers a clearly named one-off option below them', () => {
    expect(source).toContain("<Text style={[styles.stageLabelText, { color: colors.primary }]}>CATEGORY *</Text>");
    expect(source).not.toContain('CATEGORY (OPTIONAL)');
    expect(source).toContain('A category holding subcategories is a heading'); // spending lands on a subcategory
    expect(source).toContain("onPress={() => chooseCategory('Other')}");
    expect(source).toContain('testID="one-off-spending-category"');
    expect(source).toContain('Use this as the last category when part of the expense does not fit any listed category.');
  });

  it('keeps allocation controls for deliberate category selection only', () => {
    expect(source).toContain('{isAdvanced && categoryAllocations.length > 0 && (');
    expect(source).toContain('testID="category-allocation-card"');
    expect(source).toContain('testID="add-category-allocation-mobile"');
    expect(source).toContain('testID="add-category-allocation-mobile-disabled"');
    expect(source).toContain('CATEGORY AMOUNTS REQUIRED');
    expect(source).toContain('Enter how much of the expense each category covered.');
    expect(source).toContain('One-off spending amount (KES)');
    expect(source).toContain('allocationAmountLabel');
    expect(source).toContain('placeholder="Enter KES amount"');
  });

  it('keeps the running-balance notice visible in Funding before category amounts are entered', () => {
    expect(source).toContain('const hasBudgetedCategorySelection = useMemo(() => categoryAllocations.some');
    expect(source).toContain('(categoryBalancePreviews.length > 0 || hasBudgetedCategorySelection)');
    expect(source).toContain('Enter the amount covered by each category above to see its running balance here.');
    expect(source).toContain('These running balances use each category amount entered above.');
  });

  it('keeps a newly created category in its allocation position', () => {
    expect(source).toContain('const emptyIndex = standard.findIndex');
    expect(source).toContain('standard[emptyIndex] = { ...standard[emptyIndex], category: categoryName };');
    expect(source).toContain('const next = addStandardCategory(current, created.name);');
    expect(source).not.toContain('selectPrimaryCategory');
  });

  it('keeps the inline bank-account form usable on a phone', () => {
    expect(source).toContain('testID="new-bank-account-name-mobile"');
    expect(source).toContain('testID="new-bank-account-number-mobile"');
    expect(source).toContain('testID="new-bank-opening-balance-mobile"');
    expect(source).toContain('testID="add-bank-account-mobile"');
    expect(source).toContain('<Text style={styles.addSourceButtonText}>Add bank account</Text>');
    expect(source).toMatch(/inlineAccountRow:\s*\{\s*gap: 8,/);
    expect(source).toMatch(/inlineAccountInput:\s*\{[\s\S]*?width: '100%',/);
    expect(source).toMatch(/inlineAccountActions:\s*\{[\s\S]*?width: '100%',/);
  });

  it('requires an explanatory note for one-off spending', () => {
    expect(rules).toContain("allocation.category.trim().toLocaleLowerCase() === 'other'");
    expect(rules).toContain('input.notes.trim().length < 3');
    expect(rules).toContain('Add a short note explaining what this one-off expense was for.');
    expect(source).toContain("'NOTES (required for one-off spending)'");
  });

  it('blocks an uncategorized save but preserves the draft while creating a budget', () => {
    expect(source).not.toContain("text: 'Save without category'");
    expect(source).toContain("problems.length === 1 && problems[0].field === 'category' && !isEditMode");
    expect(source).toContain("text: 'Create a monthly budget'");
    expect(source).toContain('JSON.stringify({ expenseDraft })');
    expect(source).toContain("params: { recurringSetup: '1', category: description.trim() }");
    expect(budgetSource).toContain('handoff.expenseDraft');
    expect(budgetSource).toContain('categoryName: formName.trim()');
  });

  it('creates the first allocation when an uncategorized expense is recategorized', () => {
    expect(source).toContain("const next = addStandardCategory(previous, name);");
    expect(source).toContain("standard.push({ category: categoryName, amount: '' });");
    expect(rules).toContain('.filter((allocation) => allocation.category.trim())');
  });

  it('keeps one-off spending independent from regular category allocations', () => {
    expect(source).toContain('const hasOneOffAllocation = categoryAllocations.some');
    expect(source).toContain('const displayedCategoryAllocations = categoryAllocations;');
    expect(source).toContain('function toggleOneOffCategory(allocations: CategoryAllocation[]): CategoryAllocation[]');
  });

  it('lets uncategorized creates and edits pass allocation validation', () => {
    expect(source).toContain("setCategory(hydratedAllocations[0]?.category ?? '')");
    // Both rules still exist, now as one guarded branch: an allocation must be
    // a positive whole number, and the allocations must total the expense.
    expect(rules).toContain('if (allocations.length > 0) {');
    expect(rules).toContain('!Number.isInteger(allocation.amount) || allocation.amount <= 0');
    expect(rules).toContain('if (allocated !== parsed) {');
    expect(source).toContain("category: normalizedAllocations[0]?.category ?? ''");
    expect(source).toContain('categoryAllocations: expenseAllocations');
  });
});
describe('subcategories belong to Detailed mode', () => {
  it('builds the tree once and lists it grouped', () => {
    expect(source).toContain('const categoryTree = useMemo(');
    expect(source).toContain('buildCategoryTree(categories as unknown as CategoryRow[])');
    // Both modes share one grouped list now — see groupedCategoryPicker.test.ts.
    expect(source).toContain('testID={`category-group-${group.name}`}');
    // The old flat list labelled children "Parent: Child" among the parents.
    expect(source).not.toContain('groupCategoriesForPicker');
  });

  // Superseded: nothing is hidden behind a chip any more, so there is no cue
  // to give. Every subcategory is on screen under its heading.
  it('needs no cue for a hidden row, because there is no hidden row', () => {
    expect(source).not.toContain('subcategoryCount={isAdvanced ? children.length : 0}');
  });

  // The form opened at an 0.85 detent while being taller than that, so its
  // first fields sat above the visible area with the sheet's own drag
  // competing for the gesture that would bring them back.
  it('opens the expense sheet at full height', () => {
    const layout = readFileSync('app/_layout.tsx', 'utf8');
    const expenseScreen = layout.slice(layout.indexOf('name="add-expense"'), layout.indexOf('name="record-contributions"'));
    expect(expenseScreen).toContain('sheetAllowedDetents: [1]');
    expect(expenseScreen).not.toContain('[0.85, 1]');
  });

  // A form whose required field has nothing in it cannot be completed, so a
  // failed category load is worth chasing rather than leaving a link behind.
  it('retries a failed category load instead of waiting to be tapped', () => {
    expect(source).toContain('if (categoriesQuery.isError) void categoriesQuery.refetch();');
    const layout = readFileSync('app/_layout.tsx', 'utf8');
    expect(layout).toContain('return failureCount < 3;');
    expect(layout).toContain('refetchOnReconnect: true');
    // A 4xx other than 401 is an answer, not a blip.
    expect(layout).toContain('if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;');
  });

  // The create form had a Save and a Cancel and nothing that opened it: a
  // sync commit removed the only `setIsCreatingCategory(true)` in the file, so
  // no category could be created from the expense form at all — and therefore
  // no subcategory ever appeared, however much logic sat behind it.
  it('has a control that actually opens the create form', () => {
    expect(source).toContain('setIsCreatingCategory(true);');
    expect(source).toContain('testID="open-create-category"');
  });

  it('names the subcategory it would create, when a parent is chosen', () => {
    expect(source).toContain('`New subcategory under ${nestingParentName}`');
    expect(source).toContain("'New category'");
  });

  it('arrives with nesting already ticked when a parent is selected', () => {
    expect(source).toContain('setNewCategoryNestUnderParent(Boolean(nestingParent));');
  });

  // Making a subcategory meant leaving the expense for Settings on the web —
  // a poor thing to discover mid-expense.
  it('can nest a new category under the one already chosen', () => {
    expect(source).toContain('testID="create-category-nest-under-parent"');
    expect(source).toContain('...(nestUnder ? { parentId: nestUnder.id } : {})');
    expect(source).toContain('Add under');
  });

  it('only offers nesting when a parent is actually selected', () => {
    expect(source).toContain('{nestingParent && nestingParentName.trim() ? (');
    // One level deep: a child of a child is never on the table, because the
    // parent resolves through parentOf first.
    expect(source).toContain('const nestingParentName = parentOf(categoryTree, category) ?? category;');
  });

  it('captures the parent before the request, not after it', () => {
    // The selection can move while the create is in flight; a child must not
    // land under whatever happens to be selected by the time it returns.
    expect(source).toContain('const nestUnder = newCategoryNestUnderParent && nestingParent ? nestingParent : null;');
    const handler = source.slice(source.indexOf('const handleCreateCategory'), source.indexOf('await createCategory.mutateAsync'));
    expect(handler).toContain('const nestUnder =');
  });

  it('says where the category landed', () => {
    expect(source).toContain('was added under ${nestingParentName} and selected for this expense.');
  });

  // Focusing the amount on mount scrolled a 0.85-detent formSheet past its own
  // date section, and an upward drag resizes the sheet instead of scrolling
  // back — the top of the form was simply unreachable.
  it('does not focus the amount field on mount', () => {
    const amountField = source.slice(source.indexOf('EXPENSE TOTAL'), source.indexOf('CATEGORY *'));
    // The prop on a line of its own — the note explaining its absence
    // naturally mentions the word, so a substring check would match that.
    expect(amountField).not.toMatch(/^\s*autoFocus\s*$/m);
    expect(source).toContain('Deliberately not autoFocus');
  });

  it('shows every subcategory under its heading rather than in a separate row', () => {
    expect(source).toContain('onSelect={isAdvanced ? chooseSubcategory : chooseCategory}');
    expect(source).not.toContain('testID={`subcategory-row-${group.name}`}');
  });

  it('moves the parent allocation onto the subcategory rather than adding a second one', () => {
    const start = source.indexOf('const chooseSubcategory = useCallback');
    const handler = source.slice(start, source.indexOf('}, [categoryTree, chooseCategory]);', start));
    expect(handler).toContain('const parent = parentOf(categoryTree, child);');
    // Refining moves the family's allocation: the expense went to Groceries
    // *instead of* the rest of Food, so a second row would double it.
    expect(handler).toContain('const refining = previous.some((allocation) => owns(allocation.category));');
    expect(handler).toContain('owns(allocation.category) ? { ...allocation, category: replacement } : allocation');
  });

  it('adds the allocation when the family has none yet', () => {
    // Detailed sends every chip here, and mapping over an empty list left it
    // empty — so the first tap on a fresh form did nothing at all: no category
    // was selected, and the create button could never offer to nest under one.
    const start = source.indexOf('const chooseSubcategory = useCallback');
    const handler = source.slice(start, source.indexOf('}, [categoryTree, chooseCategory]);', start));
    expect(handler).toContain(': addStandardCategory(previous, replacement);');
    expect(handler).toContain('setCategory((current) => (!current || owns(current) ? replacement : current));');
  });

  it('chooses a childless top-level category outright instead of swallowing the tap', () => {
    // parentOf returns nothing for one, and the handler used to return early.
    const start = source.indexOf('const chooseSubcategory = useCallback');
    const handler = source.slice(start, source.indexOf('}, [categoryTree, chooseCategory]);', start));
    expect(handler).toContain('chooseCategory(child);');
    expect(handler).not.toContain('if (!parent) return;');
  });

  it('marks the chosen subcategory itself, there being no parent chip to mark', () => {
    expect(source).toContain('selected={categoryAllocations.some((allocation) => allocation.category === child)}');
  });
});
