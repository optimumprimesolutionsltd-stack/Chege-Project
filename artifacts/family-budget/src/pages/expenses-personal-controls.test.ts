import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const expensesSource = readFileSync(new URL("./expenses.tsx", import.meta.url), "utf8");

describe("Personal budget expense controls", () => {
  it("attributes direct Personal expenses to the owner without a payer picker", () => {
    expect(expensesSource).toContain("const isPersonalBudget = group?.isPrivate === true;");
    expect(expensesSource).toContain("const memberPayerId = isPersonalBudget ? user?.id");
    expect(expensesSource).toContain('{isPersonalBudget ? "Funding sources" : "Who paid?"}');
    expect(expensesSource).toContain("{!isPersonalBudget && (canManageExpenses ?");
    expect(expensesSource).toContain("if (!isAdding || !memberPayerId || addForm.paidFromBank) return;");
    expect(expensesSource).toContain("addForm.setPayerIds([memberPayerId]);");
  });

  it("uses neutral bank-account language and preserves personalized names", () => {
    expect(expensesSource).toContain("🏦 Bank account");
    expect(expensesSource).toContain('bankAccounts.find((account) => account.id === addForm.accountId)?.name ?? "Bank account"');
    expect(expensesSource).not.toContain("Personal bank account");
    expect(expensesSource).not.toContain("Main account");
  });

  it("keeps Shared payer controls while giving Personal budgets a distinct path", () => {
    expect(expensesSource).toContain('{!isPersonalBudget && (canManageExpenses ? (members ?? []) : (members ?? []).filter((member) => member.userId === user?.id)).map((m) => {');
    expect(expensesSource).toContain('bankAccounts.find((account) => account.id === form.accountId)?.name ?? "Bank account"');
    expect(expensesSource).toContain('isPersonalBudget ? "Choose an income source below." : canManageExpenses ? "Choose who paid, or select a bank account."');
    expect(expensesSource).toContain('paidById: addForm.paidFromBank && !effectivePaidById ? null : (effectivePaidById || undefined)');
  });
});