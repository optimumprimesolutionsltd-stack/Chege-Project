import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bankScreenSource = readFileSync(
  resolve(process.cwd(), "app/(tabs)/bank.tsx"),
  "utf8",
);

describe("mobile bank transaction display", () => {
  it("shows the user-entered transaction date instead of the record creation timestamp", () => {
    expect(bankScreenSource).toContain("formatDateTime(item.date)");
    expect(bankScreenSource).not.toContain("formatDateTime(item.createdAt)");
  });

  it("shows a visible warning before an outgoing transaction makes the balance negative", () => {
    expect(bankScreenSource).toContain('testID="bank-negative-balance-warning"');
    expect(bankScreenSource).toContain("This will take the account below zero.");
    expect(bankScreenSource).toContain("getProjectedBalanceAfterOutgoing");
  });

  it("deletes an expense-owned bank withdrawal through the expense endpoint", () => {
    expect(bankScreenSource).toContain("const deletesExpense = tx.expenseId != null;");
    expect(bankScreenSource).toContain("await deleteExpense({ id: tx.expenseId! });");
    expect(bankScreenSource).toContain("await deleteTransaction({ id: tx.id });");
    expect(bankScreenSource).toContain("Its bank funding transaction will also be removed.");
    expect(bankScreenSource).toContain("getGetExpensesQueryKey()");
  });

  it("stores and displays the opening balance date", () => {
    expect(bankScreenSource).toContain('testID="bank-opening-balance-date"');
    expect(bankScreenSource).toContain("openingBalance: value, openingBalanceDate");
    expect(bankScreenSource).toContain("As of {new Date(data.openingBalanceDate");
  });
});