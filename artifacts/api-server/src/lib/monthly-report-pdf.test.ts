import { describe, expect, it } from "vitest";
import { createMonthlyReportPdf } from "./monthly-report-pdf";

describe("monthly report PDF", () => {
  it("renders the selected month and unattributed funding section", async () => {
    const pdf = await createMonthlyReportPdf({
      groupName: "Kilimani Household",
      monthLabel: "August 2026",
      totalBudget: 50_000,
      totalSpent: 12_500,
      remaining: 37_500,
      expenseCount: 4,
      categories: [
        { category: "Food", budgetAmount: 20_000, spentAmount: 12_500, remaining: 7_500, percentUsed: 62.5 },
      ],
      totalFunding: 15_000,
      incomeStreams: [
        { sourceName: "Salary", ownerName: "Chege", total: 10_000, sharePercent: 66.7, transactionCount: 2 },
        { sourceName: "Unattributed", ownerName: "No income stream selected", total: 5_000, sharePercent: 33.3, transactionCount: 1 },
      ],
    });

    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.3");
    expect(pdf.length).toBeGreaterThan(5_000);
    expect(pdf.toString("latin1")).toContain("%%EOF");
  });
});