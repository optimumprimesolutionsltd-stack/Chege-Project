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
    expect(bankScreenSource).toContain("getProjectedBalanceAfterPosting");
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
    // Rendered through the shared helper rather than an inline new Date(): it
    // anchors a bare YYYY-MM-DD at midday, so the date shown cannot drift a day
    // either side of UTC.
    expect(bankScreenSource).toContain("As of {formatDisplayDate(data.openingBalanceDate");
  });
});

// Fixing a wrong-account entry used to mean deleting it and retyping it
// under the right one. A move sends the entry's own amount and date back
// unchanged — the only fields the server insists on — plus the new
// accountId, so nothing about the entry shifts except which account holds it.
describe("moving a transaction to a different account", () => {
  it("is offered only for an ordinary, unlinked posting", () => {
    // A transfer's two legs are a pair, and a savings or expense-linked
    // posting is not an ordinary bank entry — moving any of those on its own
    // would break what it is linked to.
    expect(bankScreenSource).toContain(
      "canManageAccount && tx.bankTransferId == null && tx.savingsGoalId == null && tx.expenseId == null",
    );
  });

  it("requires the same access as deleting, not just editing today's own entry", () => {
    expect(bankScreenSource).toContain("const canMoveTx = (tx: Tx) =>");
  });

  it("sends the entry's own amount and date back, changing only the account", () => {
    expect(bankScreenSource).toContain(
      "await updateTransaction({ id: tx.id, data: { amount: tx.amount, date: tx.date, accountId: targetAccountId } });",
    );
  });

  it("refreshes every account's balance afterwards, not just the one it left", () => {
    expect(bankScreenSource).toContain("await invalidateAccounts();");
  });

  it("offers every account except the one the entry is already on", () => {
    expect(bankScreenSource).toContain("const destinations = accounts.filter((account) => account.id !== selectedAccountId);");
  });

  it("has a move action on the transaction row, alongside edit and delete", () => {
    expect(bankScreenSource).toContain('testID={`bank-move-transaction-${item.id}`}');
    expect(bankScreenSource).toContain("onPress={() => openMovePicker(item)}");
    const row = bankScreenSource.slice(
      bankScreenSource.indexOf('testID={`bank-edit-transaction-${item.id}`}'),
      bankScreenSource.indexOf('testID={`bank-delete-transaction-${item.id}`}'),
    );
    expect(row).toContain('testID={`bank-move-transaction-${item.id}`}');
  });
});