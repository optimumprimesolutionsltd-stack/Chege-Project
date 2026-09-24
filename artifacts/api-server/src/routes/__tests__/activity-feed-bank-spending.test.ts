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

// Also missing from the feed: transfers between the group's own accounts,
// debt events (borrowed, lent, settled) and contributions recorded by hand.
describe("Activity includes transfers, debt events and hand-recorded contributions", () => {
  it("lists one transfer per pair, from the withdrawal leg", () => {
    expect(feed).toContain("const transferRows = isMonthlyReport ? [] :");
    expect(feed).toContain('eq(jointAccountTxTable.type, "disbursement")');
    expect(feed).toContain("bankTransferId} IS NOT NULL");
    expect(feed).toContain('type: "transfer"');
  });

  it("lists lending and repayments made as debt events", () => {
    expect(feed).toContain("const debtRows = isMonthlyReport ? [] :");
    // Money going out only: borrowed money and repayments received are
    // deposits the feed already lists, and must not appear twice.
    expect(feed).toContain("sql`(${jointAccountTxTable.isLending} OR ${jointAccountTxTable.settlesContributorId} IS NOT NULL)`");
    expect(feed).toContain('type: "debt"');
    expect(feed).toContain('"Repayment made"');
  });

  it("lists hand-recorded contributions as contributions", () => {
    expect(feed).toContain("const handContributions = isMonthlyReport ? [] :");
    expect(feed).toContain("id: `hand-contribution-${c.id}`");
  });
});

// An audit of what moves the bank balance found two more kinds left out:
// withdrawals with no category, and merry-go-round payouts.
describe("Activity includes uncategorised withdrawals and payouts", () => {
  it("lists withdrawals that matched no other rule, as expenses under Uncategorised", () => {
    expect(feed).toContain("const otherWithdrawals = isMonthlyReport ? [] :");
    expect(feed).toContain("sql`${jointAccountTxTable.expenseCategory} IS NULL`");
    expect(feed).toContain("isNull(jointAccountTxTable.savingsGoalId)");
    expect(feed).toContain("isNull(jointAccountTxTable.settlesContributorId)");
    expect(feed).toContain("id: `bank-other-${w.id}`");
  });

  it("lists payouts as neutral money out", () => {
    expect(feed).toContain("const payoutRows = isMonthlyReport ? [] :");
    expect(feed).toContain("id: `payout-${p.id}`");
    expect(feed).toMatch(/id: `payout-\$\{p\.id\}`,[\s\S]*?type: "debt"/);
  });

  it("never lists a payout twice: its bank withdrawal is left out of both bank queries", () => {
    const guard = "NOT EXISTS (SELECT 1 FROM group_payouts p WHERE p.transaction_id = ${jointAccountTxTable.id})";
    expect(feed.split(guard).length - 1).toBe(2);
  });
});
