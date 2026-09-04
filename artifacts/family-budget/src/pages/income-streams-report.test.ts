import { describe, expect, it } from "vitest";
import fs from "node:fs";

const reportSource = fs.readFileSync(new URL("./income-streams-report.tsx", import.meta.url), "utf8");

describe("Shared Budget report month selection", () => {
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