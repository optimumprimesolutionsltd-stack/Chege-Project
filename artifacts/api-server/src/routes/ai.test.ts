import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseBudgetSummaryPeriod } from "../lib/ai-budget-summary";

describe("AI budget summary period", () => {
  // Mid-month and mid-day, so "the current period" is the same in Nairobi and
  // in UTC: run just after midnight in Nairobi, the machine's date was still
  // the month before and these failed on the 1st.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-15T09:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts valid month and year values", () => {
    expect(parseBudgetSummaryPeriod({ month: "2", year: "2026" })).toEqual({ month: 2, year: 2026 });
  });

  it("falls back to the current period for invalid values", () => {
    expect(parseBudgetSummaryPeriod({ month: "13", year: "not-a-year" })).toEqual({ month: 9, year: 2026 });
  });

  it("rejects fractional and out-of-range periods", () => {
    expect(parseBudgetSummaryPeriod({ month: "2.5", year: "1999" })).toEqual({ month: 9, year: 2026 });
  });
});
