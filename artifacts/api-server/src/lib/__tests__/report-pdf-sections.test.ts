import { describe, expect, it } from "vitest";
import { createMonthlyReportPdf } from "../monthly-report-pdf";
import { createBankStatementPdf } from "../bank-statement-pdf";

const base = {
  groupName: "Mine", monthLabel: "September 2026", totalBudget: 1000, totalSpent: 800, remaining: 200, expenseCount: 2,
  categories: [], totalFunding: 0, incomeStreams: [],
};
const entries = Array.from({ length: 90 }, (_, i) => ({ date: "2026-09-10", description: `Entry ${i}`, detail: "Food", amount: 100 + i }));

// Every section chosen at once, long enough to run onto more pages.
describe("the report PDF, with every section chosen", () => {
  it("builds", async () => {
    const pdf = await createMonthlyReportPdf({
      ...base,
      includeSummary: false,
      businesses: [{ name: "Shop", sales: 5000, costOfGoodsSold: 3000, grossProfit: 2000, expenses: 500, netProfit: 1500 }],
      expenses: entries,
      incomeEntries: entries.slice(0, 5),
      debts: [{ name: "Hermda", owedToUs: 0, owedByUs: 75000 }],
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
  });

  it("says so when a chosen list is empty", async () => {
    const pdf = await createMonthlyReportPdf({ ...base, businesses: [], expenses: [], incomeEntries: [], debts: [] });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

describe("the bank statement PDF, money in or out only", () => {
  it("builds for each choice", async () => {
    for (const showing of ["all", "in", "out"] as const) {
      const pdf = await createBankStatementPdf({
        groupName: "Mine", accountName: "M-Pesa", periodLabel: "1 to 29 September 2026",
        openingBalance: 100, closingBalance: 50, totalIn: 20, totalOut: 70, borrowed: 0, repaidToUs: 0, lent: 0,
        rows: [{ date: "2026-09-02", description: "Naivas", detail: "Food", moneyIn: 0, moneyOut: 70, balance: 30 }],
        showing,
      });
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    }
  });
});
