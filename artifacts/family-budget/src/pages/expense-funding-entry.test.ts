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