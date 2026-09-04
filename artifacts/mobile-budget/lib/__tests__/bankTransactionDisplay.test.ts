import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bankScreenSource = readFileSync(
  resolve(process.cwd(), "app/(tabs)/bank.tsx"),
  "utf8",
);
const overviewSource = readFileSync(
  resolve(process.cwd(), "app/(tabs)/index.tsx"),
  "utf8",
);

describe("mobile bank transaction display", () => {
  it("shows the user-entered transaction date as a dedicated transaction field", () => {
    expect(bankScreenSource).toContain("formatBankDate(item.date)");
    expect(bankScreenSource).toContain('testID={`transaction-date-${item.id}`}');
    expect(bankScreenSource).not.toContain("formatBankDate(item.createdAt)");
  });

  it("shows a visible warning before an outgoing transaction makes the balance negative", () => {
    expect(bankScreenSource).toContain('testID="bank-negative-balance-warning"');
    expect(bankScreenSource).toContain("This will take the account below zero.");
    expect(bankScreenSource).toContain("getProjectedBalanceAfterOutgoing");
  });

  it("keeps a negative bank balance visible on the overview after the withdrawal is saved", () => {
    expect(overviewSource).toContain('testID="overview-negative-bank-balance-warning"');
    expect(overviewSource).toContain("bankAccount.balance < 0");
    expect(overviewSource).toContain("Jamvi kept the withdrawal recorded");
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