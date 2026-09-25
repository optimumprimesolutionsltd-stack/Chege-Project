import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/mpesa-import.ts", "utf8").replace(/\r\n/g, "\n");
const block = route.slice(route.indexOf('router.post("/mpesa/import/recategorise"'));

// Making a month of M-Pesa entries match without deleting them: only the
// category of ordinary spending may change, by a manager, in this budget.
describe("changing categories of entries already recorded from M-Pesa", () => {
  it("is for the group manager and the active budget only", () => {
    expect(block).toContain("requireGroupManager(req, res)");
    expect(block).toContain("eq(jointAccountTxTable.groupId, groupId)");
  });

  it("changes nothing but the category", () => {
    expect(block).toContain(".set({ expenseCategory: category })");
    expect(block).not.toMatch(/\.set\(\{[^}]*(amount|date|description|madeById|accountId)/);
  });

  it("only touches ordinary spending: not loans out, transfers, savings, charges or linked expenses", () => {
    for (const guard of [
      'eq(jointAccountTxTable.type, "disbursement")',
      "eq(jointAccountTxTable.isLending, false)",
      "isNull(jointAccountTxTable.bankTransferId)",
      "isNull(jointAccountTxTable.expenseId)",
      "isNull(jointAccountTxTable.savingsGoalId)",
      "isNull(jointAccountTxTable.chargeForTransactionId)",
    ]) {
      expect(block).toContain(guard);
    }
  });

  it("insists the category exists in this budget and is not a heading", () => {
    expect(block).toContain("eq(budgetCategoriesTable.groupId, groupId)");
    expect(block).toContain("headingAmong(groupId, [name])");
  });

  it("says which entries it could not change, and stores or logs nothing else", () => {
    expect(block).toContain("res.json({ updated, skipped })");
    expect(block).not.toMatch(/logger|console\./);
  });

  it("tells the screens what can be changed", () => {
    expect(route).toContain("editable:");
    expect(route).toContain("category: row.category ?? null");
  });
});
