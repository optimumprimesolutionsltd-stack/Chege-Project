import { describe, expect, it } from "vitest";
import { formatDayRangeLabel } from "../dashboard";

describe("monthly report day-range label", () => {
  it("names both ends when they share a month", () => {
    expect(formatDayRangeLabel("2026-09-01", "2026-09-14")).toBe("1 – 14 September 2026");
  });

  it("names both months when the range crosses one", () => {
    expect(formatDayRangeLabel("2026-08-28", "2026-09-03")).toBe("28 August – 3 September 2026");
  });

  it("names both years when the range crosses one", () => {
    expect(formatDayRangeLabel("2025-12-30", "2026-01-02")).toBe("30 December 2025 – 2 January 2026");
  });

  it("reads as a single date when both ends are the same day", () => {
    expect(formatDayRangeLabel("2026-09-15", "2026-09-15")).toBe("15 September 2026");
  });

  it("does not drift across a timezone boundary", () => {
    // Built from UTC throughout: parsed as local time, a date early in the
    // month can land on the previous day for anyone behind UTC, so the label
    // would name a day the report does not cover.
    expect(formatDayRangeLabel("2026-03-01", "2026-03-01")).toBe("1 March 2026");
    expect(formatDayRangeLabel("2026-01-01", "2026-01-31")).toBe("1 – 31 January 2026");
  });
});

// The route resolves the range itself; these pin the arithmetic it relies on
// rather than the SQL, which needs a database.
describe("month bounds the report falls back to", () => {
  const monthEnd = (year: number, month: number) =>
    new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  it("ends on the last day of a 30- and 31-day month", () => {
    expect(monthEnd(2026, 9)).toBe("2026-09-30");
    expect(monthEnd(2026, 1)).toBe("2026-01-31");
  });

  it("ends on the right day in February, leap year included", () => {
    expect(monthEnd(2026, 2)).toBe("2026-02-28");
    expect(monthEnd(2028, 2)).toBe("2028-02-29");
  });

  it("ends on 31 December for month 12 without spilling into the next year", () => {
    expect(monthEnd(2026, 12)).toBe("2026-12-31");
  });
});
