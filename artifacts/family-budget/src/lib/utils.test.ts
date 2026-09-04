import { describe, expect, it } from "vitest";
import { formatDate, formatKes } from "./utils";

describe("display formatting", () => {
  it("formats date-only and timestamp values consistently for Kenya", () => {
    expect(formatDate("2026-09-02")).toMatch(/^2 Sep(?:t)? 2026$/);
    expect(formatDate("2026-09-02T08:30:00.000Z")).toMatch(/^2 Sep(?:t)? 2026$/);
  });

  it("returns a clear fallback for invalid dates", () => {
    expect(formatDate("not-a-date")).toBe("Date unavailable");
  });

  it("keeps KES currency and amount together", () => {
    expect(formatKes(125000)).toContain("125,000");
    expect(formatKes(125000).toLowerCase()).toContain("ksh");
  });
});