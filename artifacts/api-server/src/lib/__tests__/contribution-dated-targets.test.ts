import { describe, expect, it } from "vitest";
import { prorateExpected, prorateExpectedDated, targetOn, type DatedTarget } from "../contribution-statement";

const rows = (...entries: Array<[string, number | null]>): DatedTarget[] =>
  entries.map(([effectiveFrom, amount]) => ({ effectiveFrom, amount }));

describe("targetOn", () => {
  it("falls back to the old undated figure before the first dated row", () => {
    // This is what lets dated targets ship without a backfill: a group that
    // never sets one keeps measuring against the figure it always had.
    expect(targetOn("2026-01-15", rows(["2026-06-01", 1000]), 500)).toBe(500);
    expect(targetOn("2026-01-15", [], 500)).toBe(500);
  });

  it("uses a dated amount from its own first day", () => {
    const dated = rows(["2026-06-01", 1000]);
    expect(targetOn("2026-05-31", dated, 500)).toBe(500);
    expect(targetOn("2026-06-01", dated, 500)).toBe(1000);
    expect(targetOn("2026-06-02", dated, 500)).toBe(1000);
  });

  it("takes the latest row in force, whatever order they arrive in", () => {
    const dated = rows(["2026-09-01", 2000], ["2026-06-01", 1000], ["2026-07-01", 1500]);
    expect(targetOn("2026-06-15", dated, 500)).toBe(1000);
    expect(targetOn("2026-08-31", dated, 500)).toBe(1500);
    expect(targetOn("2026-09-01", dated, 500)).toBe(2000);
  });

  it("lets a null amount end an expectation without erasing what came before", () => {
    const dated = rows(["2026-06-01", 1000], ["2026-09-01", null]);
    expect(targetOn("2026-08-31", dated, 500)).toBe(1000);
    expect(targetOn("2026-09-01", dated, 500)).toBeNull();
  });

  it("returns null when there was never an expectation at all", () => {
    expect(targetOn("2026-06-15", [], null)).toBeNull();
  });
});

describe("prorateExpectedDated", () => {
  it("matches the undated calculation while the amount never changes", () => {
    for (const [from, to] of [["2026-09-01", "2026-09-30"], ["2026-09-01", "2026-09-14"], ["2026-08-15", "2026-10-10"]]) {
      expect(prorateExpectedDated(from, to, [], 1000)).toBe(prorateExpected(1000, from, to));
    }
  });

  it("charges each month at the amount in force that month", () => {
    // 1,000 through September, 2,000 from October.
    const dated = rows(["2026-10-01", 2000]);
    expect(prorateExpectedDated("2026-09-01", "2026-10-31", dated, 1000)).toBe(3000);
  });

  it("leaves the past measured against what was owed then", () => {
    // The point of the whole change: raising someone today must not rewrite
    // what they owed last year.
    const dated = rows(["2026-09-15", 1000]);
    expect(prorateExpectedDated("2025-01-01", "2025-12-31", dated, 500)).toBe(6000);
  });

  it("splits a month when the amount changes inside it", () => {
    // September has 30 days: 14 at 3,000 and 16 at 6,000.
    const dated = rows(["2026-09-15", 6000]);
    const expected = Math.round((14 * 3000) / 30 + (16 * 6000) / 30);
    expect(prorateExpectedDated("2026-09-01", "2026-09-30", dated, 3000)).toBe(expected);
  });

  it("weights a day by its own month's length", () => {
    // One day of a 1,000 month is worth more in February than in March.
    const february = prorateExpectedDated("2026-02-01", "2026-02-01", [], 1000);
    const march = prorateExpectedDated("2026-03-01", "2026-03-01", [], 1000);
    expect(february).toBeGreaterThan(march);
    expect(february).toBe(Math.round(1000 / 28));
    expect(march).toBe(Math.round(1000 / 31));
  });

  it("counts a leap February as 29 days", () => {
    expect(prorateExpectedDated("2028-02-01", "2028-02-29", [], 1000)).toBe(1000);
  });

  it("expects nothing across a stretch with no expectation", () => {
    expect(prorateExpectedDated("2026-09-01", "2026-09-30", [], null)).toBe(0);
    expect(prorateExpectedDated("2026-09-01", "2026-09-30", rows(["2026-09-01", null]), 1000)).toBe(0);
  });

  it("reads a backwards range the right way round", () => {
    expect(prorateExpectedDated("2026-09-30", "2026-09-01", [], 1000))
      .toBe(prorateExpectedDated("2026-09-01", "2026-09-30", [], 1000));
  });

  it("returns nothing for a malformed date rather than guessing", () => {
    expect(prorateExpectedDated("not-a-date", "2026-09-30", [], 1000)).toBe(0);
  });
});
