import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(new URL("../dashboard.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const feed = dashboard.slice(dashboard.indexOf('router.get("/dashboard/activity"'), dashboard.indexOf('router.get("/dashboard/', dashboard.indexOf('router.get("/dashboard/activity"') + 10));

// The general Activity feed was built from hand-entered expenses, deposits
// and savings contributions only, so a day of banking (categorised
// withdrawals, which every other figure counts as spending) never appeared
// there. Reported as: "activity has more than this" over a feed of 2 items.
describe("Activity includes spending that went through the bank", () => {
  it("reads categorised, non-transfer, non-expense-linked withdrawals", () => {
    expect(feed).toContain('eq(jointAccountTxTable.type, "disbursement")');
    expect(feed).toContain("isNull(jointAccountTxTable.bankTransferId)");
    expect(feed).toContain("isNull(jointAccountTxTable.expenseId)");
    expect(feed).toContain("expenseCategory} IS NOT NULL");
  });

  it("adds them to the merged feed as expenses, keyed apart from real expense ids", () => {
    expect(feed).toContain("...bankSpending.map((w) => ({");
    expect(feed).toContain("id: `bank-spend-${w.id}`");
    expect(feed).toContain('type: "expense"');
  });

  it("does not touch the monthly contribution report path", () => {
    expect(feed).toContain("const bankSpending = isMonthlyReport ? [] :");
  });
});
