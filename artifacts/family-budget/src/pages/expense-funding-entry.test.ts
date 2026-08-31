import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("./dashboard.tsx", import.meta.url), "utf8");
const expensesSource = readFileSync(new URL("./expenses.tsx", import.meta.url), "utf8");
const mobileSource = readFileSync(
  new URL("../../../mobile-budget/app/add-expense.tsx", import.meta.url),
  "utf8",
);
const budgetSource = readFileSync(new URL("./budget.tsx", import.meta.url), "utf8");
const mobileBudgetSource = readFileSync(
  new URL("../../../mobile-budget/app/(tabs)/budget.tsx", import.meta.url),
  "utf8",
);

describe("expense funding amount entry", () => {
  it("requires an amount for one direct or bank source in dashboard quick log", () => {
    expect(dashboardSource).toContain("Type the amount from this source to confirm");
    expect(dashboardSource).toContain("Type the amount from this account to confirm");
    expect(dashboardSource).toContain("Keep adding funding sources until the remaining amount reaches zero");
    expect(dashboardSource).toContain('data-testid="quick-expense-funding-remainder"');
    expect(dashboardSource).toContain("additionalDirectPortions");
    expect(dashboardSource).toContain('{ sourceId, amount: "" }');
    expect(dashboardSource).toContain('{ sourceId: source.id, amount: "" }');
    expect(dashboardSource).toContain('title: remaining > 0 ? "Choose another funding source"');
    expect(dashboardSource).not.toContain("setBankPortion(remainder");
    expect(dashboardSource).not.toContain("setDirectPortion(remainder");
    expect(dashboardSource).not.toContain('["mixed", "Both"');
  });

  it("requires an amount for one source in the full web expense form", () => {
    expect(expensesSource).toContain("sourceCount === 1");
    expect(expensesSource).toContain("Type the amount from this source to confirm");
    expect(expensesSource).toContain("Type the amount from this account to confirm");
    expect(expensesSource).toContain("Enter the amount from each selected source manually");
    expect(expensesSource).toContain("getFundingRemainder(Number(form.amount)");
    expect(expensesSource).toContain('setAddDirectSourceAmounts((previous) => ({ ...previous, [key]: "" }))');
    expect(expensesSource).toContain('[m.userId]: ""');
    expect(expensesSource).toContain('title: remaining > 0 ? "Add another funding source"');
    expect(expensesSource).toContain("Add another income source...");
    expect(expensesSource).toContain("as many times as needed until the expense is fully funded");
    expect(expensesSource).toContain('data-testid="expense-funding-remainder"');
    expect(expensesSource).not.toContain("addFundingSourceWithRemainder");
    expect(expensesSource).not.toContain("Jamvi fills the remaining amount into the other selected source");
    expect(expensesSource).not.toContain("next.__joint_bank__ = remainder");
  });

  it("requires selected mobile sources to account for the full expense", () => {
    expect(mobileSource).toContain("selectedSources.length > 0");
    expect(mobileSource).toContain("'Add another funding source'");
    expect(mobileSource).toContain("Enter each amount manually. This prevents a mistaken automatic allocation.");
    expect(mobileSource).toContain("TYPE THE AMOUNT FROM THIS ACCOUNT TO CONFIRM");
    expect(mobileSource).toContain("Enter the amount from each selected source manually");
    expect(mobileSource).toContain("const remaining = getFundingRemainder(total, directTotal);");
    expect(mobileSource).toContain("setSplitAmounts((amounts) => ({ ...amounts, [key]: '' }))");
    expect(mobileSource).not.toContain("addFundingSourceWithRemainder");
    expect(mobileSource).toContain('testID="expense-funding-remainder"');
    expect(mobileSource).not.toContain("if (previous.length >= 2)");
  });

  it("adds a newly created mobile income source without replacing an existing partial portion", () => {
    expect(mobileSource).toContain("setSelectedSources((previous) => previous.includes(sourceKey) ? previous : [...previous, sourceKey])");
    expect(mobileSource).toContain("setSplitAmounts((previous) => ({ ...previous, [sourceKey]: '' }))");
    expect(mobileSource).toContain("selectedSources.map((key, index) =>");
    expect(mobileSource).not.toContain("if (previous.length >= 2)");
  });

  it("keeps mixed bank and personal funding controls available while creating an expense", () => {
    expect(expensesSource).toContain("{form.paidFromBank && (");
    expect(expensesSource).toContain("!allowMixedFunding && canManageExpenses");
    expect(expensesSource).toContain("Add another funding source");
    expect(dashboardSource).toContain('data-testid="quick-expense-add-funding-source"');
    expect(dashboardSource).toContain("(!paidFromBank || allowMixedFunding)");
    expect(mobileSource).toContain("!allowMixedFunding && canManageShared");
    expect(mobileSource).not.toContain("isEditMode && !allowMixedFunding && canManageShared");
  });

  it("places new-source creation after the existing funding rows", () => {
    const expenseRows = expensesSource.indexOf('data-testid="expense-direct-funding-portions"');
    const expenseNewSource = expensesSource.indexOf("+ New source");
    expect(expenseRows).toBeGreaterThan(-1);
    expect(expenseNewSource).toBeGreaterThan(expenseRows);

    const dashboardRows = dashboardSource.indexOf("additionalDirectPortions.map");
    const dashboardNewSource = dashboardSource.indexOf("+ New source");
    expect(dashboardRows).toBeGreaterThan(-1);
    expect(dashboardNewSource).toBeGreaterThan(dashboardRows);
  });

  it("keeps direct funding and fills only the remaining amount when bank is selected", () => {
    expect(expensesSource).toContain("const remaining = getFundingRemainder(Number(form.amount), directTotal);");
    expect(expensesSource).toContain("__joint_bank__: directTotal > 0 ? String(remaining) : form.amount");
    expect(expensesSource).toContain("...previous");
    expect(dashboardSource).toContain("const remaining = getFundingRemainder(Number(amount), directTotal);");
    expect(dashboardSource).toContain("setBankPortion(directTotal > 0 ? String(remaining) : amount)");
    expect(mobileSource).toContain("__joint_bank__: directTotal > 0 ? String(remaining) : amount.replace");
    expect(mobileSource).toContain("(!paidFromBank || allowMixedFunding) && selectedSources.length > 0");
  });

  it("keeps Shared budget member amounts blank until the user enters them", () => {
    expect(expensesSource).toContain('[m.userId]: ""');
    expect(mobileSource).toContain("[m.userId]: ''");
    expect(expensesSource).not.toContain("[next[0]]: remainder");
    expect(mobileSource).not.toContain("[next[0]]: remainder");
  });

  it("shows an explicit mobile add-category action", () => {
    expect(mobileSource).toContain('testID="add-category-allocation-mobile"');
    expect(mobileSource).toContain("Add another category");
    expect(mobileSource).toContain("showAdditionalCategoryPicker");
  });

  it("requires category amounts to be entered manually on every expense form", () => {
    expect(dashboardSource).toContain("KES amount covered by the primary category");
    expect(dashboardSource).toContain('data-testid="primary-category-allocation-dashboard"');
    expect(dashboardSource).toContain('className="flex flex-col gap-2 sm:flex-row sm:items-center"');
    expect(dashboardSource).toContain('className="h-11 w-full border-primary/45 bg-card font-semibold"');
    expect(dashboardSource).toContain("{isOtherCategory && (");
    expect(dashboardSource).toContain("const isPrimaryOtherCategory = categoryAllocations[0]?.category.trim().toLocaleLowerCase() === \"other\";");
    expect(dashboardSource).not.toContain("{category.trim() && categoryAllocations.length === 1 && (\n                <div");
    expect(dashboardSource).toContain("Need to split this expense? Add another category and enter its share.");
    expect(dashboardSource).toContain('disabled={!category.trim()}');
    expect(dashboardSource).toContain("Choose a category first, then add another category");
    expect(dashboardSource).toContain("categoryAllocations.slice(1).map");
    expect(dashboardSource).toContain("const hasStandardAdditionalCategory");
    expect(dashboardSource).toContain("dashboard-additional-category-amount");
    expect(dashboardSource).toContain("<option value=\"\">Select a category</option>");
    expect(dashboardSource).not.toContain("<option value=\"\" disabled>Pick a category</option>");
    expect(dashboardSource).not.toContain("One-off spending is for a one-time expense that does not fit any listed category.");
    expect(dashboardSource).toContain("One-off spending amount (KES)");
    expect(dashboardSource).not.toContain('<option value="Other"');
    expect(dashboardSource).toContain('data-testid="one-off-spending-category-dashboard"');
    expect(dashboardSource).toContain("Use One-off spending for a one-time expense that does not fit any listed category.");
    expect(dashboardSource).toContain("{!isOtherCategory && (");
    expect(dashboardSource).toContain('placeholder="Enter KES amount"');
    expect(dashboardSource).toContain("onChange={e => setAmount(e.target.value)}");
    expect(dashboardSource).not.toContain("setCategoryAllocations(current => current.length === 1 ? [{ ...current[0], amount: e.target.value }]");
    expect(expensesSource).toContain("const setAmount = (value: string) => setAmountValue(value);");
    expect(expensesSource).toContain("KES amount covered by the primary category");
    expect(expensesSource).toContain('data-testid={`primary-category-allocation-${mode}`}');
    expect(expensesSource).toContain('className="flex flex-col gap-2 sm:flex-row sm:items-center"');
    expect(expensesSource).toContain('className="h-12 w-full border-primary/45 bg-card font-semibold"');
    expect(expensesSource).toContain("{isOtherCategory && (");
    expect(expensesSource).toContain("Need to split this expense? Add another category and enter its share.");
    expect(expensesSource).toContain('disabled={!form.category.trim()}');
    expect(expensesSource).toContain("Choose a category first, then add another category");
    expect(expensesSource).toContain("form.categoryAllocations.slice(1).map");
    expect(expensesSource).toContain("const hasStandardAdditionalCategory");
    expect(expensesSource).toContain("additional-category-amount");
    expect(expensesSource).toContain("<option value=\"\">Select a category</option>");
    expect(expensesSource).not.toContain("<option value=\"\" disabled>Select category...</option>");
    expect(expensesSource).not.toContain("One-off spending is for a one-time expense that does not fit any listed category.");
    expect(expensesSource).toContain("One-off spending amount (KES)");
    expect(expensesSource).not.toContain('<option value="Other"');
    expect(expensesSource).toContain('data-testid={`one-off-spending-category-${mode}`}');
    expect(expensesSource).toContain("Use One-off spending for a one-time expense that does not fit any listed category.");
    expect(expensesSource).toContain("{!isOtherCategory && (");
    expect(expensesSource).toContain('aria-required="true"');
    expect(expensesSource).toContain('placeholder="Enter KES amount"');
    expect(mobileSource).toContain("CATEGORY AMOUNTS REQUIRED");
    expect(mobileSource).toContain("Enter how much of the expense each category covered.");
    expect(mobileSource).toContain("One-off spending amount (KES)");
    expect(mobileSource).toContain("Use this for a one-time expense that does not fit any listed category.");
    expect(mobileSource).toContain(": [{ category: result.categoryName!, amount: '' }]");
    expect(mobileSource).not.toContain("amount: result.expenseDraft?.amount ?? amount");
  });

  it("rejects whitespace-only web descriptions and submits trimmed descriptions", () => {
    expect(expensesSource).toContain("const addDescription = addForm.description.trim();");
    expect(expensesSource).toContain("if (!addDescription || !addForm.date)");
    expect(expensesSource).toContain("description: addDescription");
    expect(expensesSource).toContain("const editDescription = editForm.description.trim();");
    expect(expensesSource).toContain("if (!editDescription || !editForm.date)");
    expect(expensesSource).toContain("description: editDescription");
  });

  it("treats one-off spending as a category with its own amount", () => {
    for (const source of [dashboardSource, expensesSource]) {
      const oneOffControl = source.indexOf("one-off-spending-category");
      const primaryAmount = source.indexOf("One-off spending amount (KES)", oneOffControl);
      const addAnotherControl = source.indexOf("Add another category", primaryAmount);

      expect(oneOffControl).toBeGreaterThan(-1);
      expect(primaryAmount).toBeGreaterThan(oneOffControl);
      expect(addAnotherControl).toBeGreaterThan(primaryAmount);
      expect(source).not.toContain('<option value="Other">One-off spending</option>');
    }

    const mobileOneOff = mobileSource.indexOf('testID="one-off-spending-category"');
    const mobileAmount = mobileSource.indexOf("One-off spending amount (KES)", mobileOneOff);
    const mobileAddAnother = mobileSource.indexOf("Add another category", mobileAmount);
    expect(mobileOneOff).toBeGreaterThan(-1);
    expect(mobileAmount).toBeGreaterThan(mobileOneOff);
    expect(mobileAddAnother).toBeGreaterThan(mobileAmount);
  });

  it("keeps one-off spending independent from category splits", () => {
    expect(dashboardSource).toContain('return [{ category: "Other", amount: existingOneOff?.amount ?? "" }]');
    expect(expensesSource).toContain('return [{ category: "Other", amount: existingOneOff?.amount ?? "" }]');
    expect(mobileSource).toContain("return [{ category: 'Other', amount: existingOneOff?.amount ?? '' }]");
    expect(dashboardSource).toContain("!isOtherCategory && categoryAllocations.length === 1");
    expect(expensesSource).toContain("!isOtherCategory && form.categoryAllocations.length === 1");
    expect(mobileSource).toContain("!hasOneOffAllocation && <Pressable");
  });

  it("explains where an expense goes when no category is selected", () => {
    for (const source of [dashboardSource, expensesSource, mobileSource]) {
      expect(source).toContain("Uncategorized");
      expect(source).toContain("outside any budget category");
    }
    expect(dashboardSource).toContain('<option value="">Select a category</option>');
    expect(expensesSource).toContain('<option value="">Select a category</option>');
    expect(dashboardSource).not.toContain('<option value="">No category</option>');
    expect(expensesSource).not.toContain('<option value="">No category</option>');
  });
});

describe("inline expense bank-account creation", () => {
  it("is available in dashboard quick log, the full web form, and mobile", () => {
    expect(dashboardSource).toContain("+ New bank account");
    expect(expensesSource).toContain("+ New bank account");
    expect(mobileSource).toContain("New bank account");
    expect(mobileSource).toContain("handleCreateBankAccount");
  });
});

describe("recurring expense budget setup", () => {
  it("uses the Budget tab to collect the web average monthly amount without losing the expense draft", () => {
    expect(expensesSource).toContain('RECURRING_EXPENSE_DRAFT_KEY');
    expect(expensesSource).toContain('recurringSetup=1');
    expect(expensesSource).toContain('params.get("resumeRecurring") !== "1"');
    expect(budgetSource).toContain('Set average monthly amount');
    expect(budgetSource).toContain('Average monthly amount (KES)');
    expect(budgetSource).toContain('recurringMonthlyBudget: String(change?.budgetAmount ?? 0)');
  });

  it("uses the Budget tab to collect the mobile average monthly amount and returns it to the expense", () => {
    expect(mobileSource).toContain('RECURRING_BUDGET_HANDOFF_KEY');
    expect(mobileSource).toContain("pathname: '/(tabs)/budget'");
    expect(mobileSource).toContain("recurringSetup: '1'");
    expect(mobileSource).toContain('setRecurringMonthlyBudget(result.monthlyBudget)');
    expect(mobileBudgetSource).toContain('Set average monthly amount');
    expect(mobileBudgetSource).toContain('AVERAGE MONTHLY AMOUNT (KES)');
    expect(mobileBudgetSource).toContain('{ monthlyBudget: String(amt), isRecurring: true }');
  });
});