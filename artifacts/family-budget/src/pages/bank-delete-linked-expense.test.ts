import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bankSource = readFileSync(new URL("./bank.tsx", import.meta.url), "utf8");

describe("bank transaction deletion", () => {
  it("deletes an expense-owned withdrawal through the expense endpoint", () => {
    expect(bankSource).toContain("const deletesExpense = tx.expenseId != null;");
    expect(bankSource).toContain("await deleteExpense.mutateAsync({ id: tx.expenseId! });");
    expect(bankSource).toContain("await deleteTx.mutateAsync({ id: tx.id });");
    expect(bankSource).toContain("Its bank funding transaction will also be removed.");
    expect(bankSource).toContain("getGetExpensesQueryKey()");
    expect(bankSource).toContain("onClick={() => handleDelete(tx)}");
  });
});