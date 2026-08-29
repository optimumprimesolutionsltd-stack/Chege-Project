import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("./dashboard.tsx", import.meta.url), "utf8");
const expensesSource = readFileSync(new URL("./expenses.tsx", import.meta.url), "utf8");
const mobileSource = readFileSync(
  new URL("../../../mobile-budget/app/add-expense.tsx", import.meta.url),
  "utf8",
);

describe("expense funding amount entry", () => {
  it("requires an amount for one direct or bank source in dashboard quick log", () => {
    expect(dashboardSource).toContain("Type the amount from this source to confirm");
    expect(dashboardSource).toContain("Type the amount from this account to confirm");
    expect(dashboardSource).toContain("Enter this manually");
    expect(dashboardSource).toContain('title: remaining > 0 ? "Choose another funding source"');
    expect(dashboardSource).toContain("getFundingRemainder(total, direct)");
    expect(dashboardSource).not.toContain('["mixed", "Both"');
  });

  it("requires an amount for one source in the full web expense form", () => {
    expect(expensesSource).toContain("sourceCount === 1");
    expect(expensesSource).toContain("Type the amount from this source to confirm");
    expect(expensesSource).toContain("Type the amount from this account to confirm");
    expect(expensesSource).toContain("Jamvi fills the remaining amount into the other selected source");
    expect(expensesSource).toContain("getFundingRemainder(Number(form.amount)");
    expect(expensesSource).toContain("addFundingSourceWithRemainder({");
    expect(expensesSource).toContain("selectedSourceIds: form.payerIds");
    expect(expensesSource).toContain('title: remaining > 0 ? "Add another funding source"');
  });

  it("requires selected mobile sources to account for the full expense", () => {
    expect(mobileSource).toContain("selectedSources.length > 0");
    expect(mobileSource).toContain("'Add another funding source'");
    expect(mobileSource).toContain("Type the amount from this source to confirm");
    expect(mobileSource).toContain("TYPE THE AMOUNT FROM THIS ACCOUNT TO CONFIRM");
    expect(mobileSource).toContain("Jamvi fills the remaining amount into the other selected source");
    expect(mobileSource).toContain("getFundingRemainder(parseFloat(amount.replace");
    expect(mobileSource).toContain("selectedSourceIds: previous");
    expect(mobileSource).toContain("newSourceId: key");
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