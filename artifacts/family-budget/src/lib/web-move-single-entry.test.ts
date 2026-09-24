import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bank = readFileSync(new URL("../pages/bank.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

// Mobile has had a per-entry move since #315; web only had Move a day.
describe("web can move a single entry to another account", () => {
  it("offers the move on rows that can change accounts, using the same rule as Move a day", () => {
    expect(bank).toContain("canMoveTx(tx) && accounts.length > 1 && <Button");
    expect(bank).toContain("tx.bankTransferId == null && tx.savingsGoalId == null && tx.expenseId == null");
  });
  it("resends only the entry's own amount and date with the new account", () => {
    expect(bank).toContain("updateTx.mutateAsync({ id: tx.id, data: { amount: tx.amount, date: tx.date, accountId: targetAccountId } })");
  });
});
