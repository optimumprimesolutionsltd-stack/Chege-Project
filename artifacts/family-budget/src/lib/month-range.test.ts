import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { monthRange, stepMonth, wholeMonthOf } from "./month-range";

const today = "2026-10-01";

// The phone's month stepper (#509), on the web too.
describe("whole months as ranges", () => {
  it("runs a past month from its 1st to its last day, and stops this month at today", () => {
    expect(monthRange(2026, 9, today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(monthRange(2024, 2, today)).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(monthRange(2026, 10, today)).toEqual({ from: "2026-10-01", to: "2026-10-01" });
  });

  it("names a whole month and calls anything else custom", () => {
    expect(wholeMonthOf("2026-09-01", "2026-09-30", today)).toEqual({ year: 2026, month: 9 });
    expect(wholeMonthOf("2026-09-02", "2026-09-30", today)).toBeNull();
  });

  it("steps across the year", () => {
    expect(stepMonth("2026-01-15", -1, today)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
});

describe("the month stepper sits above every From/To pair on the web", () => {
  it.each([
    ["../pages/statement.tsx", "statement-month"],
    ["../components/bank-period-picker.tsx", "bank-period-month"],
    ["../components/download-contributions.tsx", "contribution-export-month"],
    ["../pages/income-streams-report.tsx", "income-streams-month"],
  ])("%s", (path, testId) => {
    expect(readFileSync(new URL(path, import.meta.url), "utf8")).toContain(`testId="${testId}"`);
  });
});
