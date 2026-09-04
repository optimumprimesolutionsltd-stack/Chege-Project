import { describe, expect, it } from "vitest";
import { parseBudgetSummaryPeriod } from "../lib/ai-budget-summary";

describe("AI budget summary period", () => {
  it("accepts valid month and year values", () => {
    expect(parseBudgetSummaryPeriod({ month: "2", year: "2026" })).toEqual({ month: 2, year: 2026 });
  });

  it("falls back to the current period for invalid values", () => {
    const now = new Date();
    expect(parseBudgetSummaryPeriod({ month: "13", year: "not-a-year" })).toEqual({
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    });
  });

  it("rejects fractional and out-of-range periods", () => {
    const now = new Date();
    expect(parseBudgetSummaryPeriod({ month: "2.5", year: "1999" })).toEqual({
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    });
  });
});
