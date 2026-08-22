import { describe, expect, it } from "vitest";
import { getPeriodRange } from "./period-range";

const defaults = {
  anchorDate: "2026-08-16",
  month: 8,
  year: 2026,
  customStartDate: "2026-08-03",
  customEndDate: "2026-08-12",
};

describe("getPeriodRange", () => {
  it("returns a single inclusive day", () => {
    expect(getPeriodRange({ ...defaults, view: "day" })).toEqual({
      startDate: "2026-08-16",
      endDate: "2026-08-16",
    });
  });

  it("returns Monday through Sunday for the selected week", () => {
    expect(getPeriodRange({ ...defaults, view: "week" })).toEqual({
      startDate: "2026-08-10",
      endDate: "2026-08-16",
    });
  });

  it("returns complete months including leap-year February", () => {
    expect(getPeriodRange({ ...defaults, view: "month", month: 2, year: 2024 })).toEqual({
      startDate: "2024-02-01",
      endDate: "2024-02-29",
    });
  });

  it("preserves the selected custom range for server-side validation", () => {
    expect(getPeriodRange({
      ...defaults,
      view: "custom",
      customStartDate: "2026-08-20",
      customEndDate: "2026-08-10",
    })).toEqual({
      startDate: "2026-08-20",
      endDate: "2026-08-10",
    });
  });
});