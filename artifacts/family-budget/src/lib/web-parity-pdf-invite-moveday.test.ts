import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dayOf, movableOnDay, summariseDays } from "./move-day";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const tx = (id: number, date: string, movable = true) => ({ id, date, movable });
const canMove = (t: { movable: boolean }) => t.movable;

describe("web matches mobile: Move a day", () => {
  const txs = [tx(1, "2026-09-20"), tx(2, "2026-09-20T09:00:00.000Z"), tx(3, "2026-09-20", false), tx(4, "2026-09-22"), tx(5, "2026-09-21", false)];

  it("lists days that have something movable, newest first", () => {
    expect(dayOf("2026-09-20T09:00:00.000Z")).toBe("2026-09-20");
    expect(summariseDays(txs, canMove)).toEqual([
      { date: "2026-09-22", movable: 1, total: 1 },
      { date: "2026-09-20", movable: 2, total: 3 },
    ]);
    expect(movableOnDay(txs, "2026-09-20", canMove).map((t) => t.id)).toEqual([1, 2]);
  });

  it("is wired to the Bank page with the same rule as mobile", () => {
    const bank = read("../pages/bank.tsx");
    expect(bank).toContain('data-testid="bank-move-day"');
    expect(bank).toContain("tx.bankTransferId == null && tx.savingsGoalId == null && tx.expenseId == null");
    expect(bank).toContain("movableOnDay(all, moveDayDate, canMoveTx)");
  });
});

describe("web matches mobile: PDF section checkboxes and the Invite link", () => {
  it("offers the monthly report sections and sends them", () => {
    const report = read("../pages/income-streams-report.tsx");
    expect(report).toContain('data-testid="checkbox-pdf-budget"');
    expect(report).toContain("getDashboardMonthlyReportPdf({ month, year, includeBudget, includeIncome }");
  });

  it("offers the ledger sections and only sends what is switched off", () => {
    const ledger = read("../components/download-contributions.tsx");
    expect(ledger).toContain('data-testid="checkbox-ledger-entries"');
    expect(ledger).toContain('params.set("includeEntries", "false")');
    expect(ledger).toContain('params.set("includePerMemberTotals", "false")');
  });

  it("links owners and admins of a shared group to the invite form", () => {
    const dashboard = read("../pages/dashboard.tsx");
    expect(dashboard).toContain("{isSharedWorkspace && canManageBank ? (");
    expect(dashboard).toContain('href="/settings#invite"');
    const settings = read("../pages/settings.tsx");
    expect(settings).toContain('<form id="invite"');
    expect(settings).toContain('window.location.hash !== "#invite"');
  });
});
