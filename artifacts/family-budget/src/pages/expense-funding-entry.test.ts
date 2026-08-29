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
    expect(dashboardSource).toContain("Amount from this source");
    expect(dashboardSource).toContain("Amount from this account");
    expect(dashboardSource).toContain('title: remaining > 0 ? "Add another funding source"');
  });

  it("requires an amount for one source in the full web expense form", () => {
    expect(expensesSource).toContain("sourceCount === 1");
    expect(expensesSource).toContain("Amount from this source");
    expect(expensesSource).toContain("Amount from this account");
    expect(expensesSource).toContain('title: remaining > 0 ? "Add another funding source"');
  });

  it("requires selected mobile sources to account for the full expense", () => {
    expect(mobileSource).toContain("selectedSources.length > 0");
    expect(mobileSource).toContain("'Add another funding source'");
    expect(mobileSource).toContain("How much from this source?");
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