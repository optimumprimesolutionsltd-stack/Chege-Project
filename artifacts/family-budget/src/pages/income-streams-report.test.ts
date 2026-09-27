import { describe, expect, it } from "vitest";
import fs from "node:fs";

const reportSource = fs.readFileSync(new URL("./income-streams-report.tsx", import.meta.url), "utf8");

describe("Shared Group report month selection", () => {
  it("opens the previous month when the current month has no expenses", () => {
    expect(reportSource).toContain("(monthlySummary.data?.expenseCount ?? 0) === 0");
    expect(reportSource).toContain("(previousMonthSummary.data?.expenseCount ?? 0) > 0");
    expect(reportSource).toContain("setMonth(previousCalendarMonth.month);");
    expect(reportSource).toContain("setYear(previousCalendarMonth.year);");
  });

  it("explains the automatic month change and lets the user return", () => {
    expect(reportSource).toContain('data-testid="latest-expense-month-notice"');
    expect(reportSource).toContain("The current month has no recorded expenses yet");
    expect(reportSource).toContain("View current month");
  });
});

describe("linking a category as an income stream's cost", () => {
  it("only a manager sees the link control, matching the server's own rule", () => {
    expect(reportSource).toContain('canManageCostCategories = pdfGroup?.role === "owner" || pdfGroup?.role === "admin"');
    expect(reportSource).toContain("!unattributed && canManageCostCategories");
  });

  it("shows the sales-minus-cost breakdown once a category is linked", () => {
    expect(reportSource).toContain("stream.costs > 0");
    expect(reportSource).toContain("sales − ");
    expect(reportSource).toContain('= {formatKes(stream.total)} profit');
  });

  it("moves the link off whichever category held it before setting a new one", () => {
    expect(reportSource).toContain("const previouslyLinked = categories.find((category) => category.reducesIncomeSourceId === incomeSourceId);");
    expect(reportSource).toContain("if (previouslyLinked && previouslyLinked.id === categoryId) return;");
    expect(reportSource).toContain("reducesIncomeSourceId: null");
  });

  it("invalidates both the category list and this month's income streams after a change", () => {
    expect(reportSource).toContain("getGetBudgetCategoriesQueryKey()");
    expect(reportSource).toContain("getGetDashboardIncomeStreamsQueryKey({ month, year })");
  });

  it('offers a "None" option to clear the link entirely', () => {
    expect(reportSource).toContain('<option value="">None</option>');
  });
});