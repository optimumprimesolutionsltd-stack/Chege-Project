/**
 * Period arithmetic and promo pricing.
 *
 * These decide what somebody is charged and how long it buys them, so the
 * cases worth writing down are the ones where a plausible implementation
 * quietly takes days or money that were not owed.
 */

import { describe, expect, it } from "vitest";
import { BILLING_INTERVAL } from "@workspace/jamvi-pricing";
import { periodEnd } from "../subscription-billing";

describe("periodEnd", () => {
  it("adds a month for monthly", () => {
    expect(periodEnd(new Date("2026-09-05T12:00:00Z"), BILLING_INTERVAL.MONTHLY))
      .toEqual(new Date("2026-10-05T12:00:00Z"));
  });

  it("adds a year for annual", () => {
    expect(periodEnd(new Date("2026-09-05T12:00:00Z"), BILLING_INTERVAL.ANNUAL))
      .toEqual(new Date("2027-09-05T12:00:00Z"));
  });

  it("carries a 31st into a short month without skipping one", () => {
    // JavaScript rolls 31 January + 1 month into 3 March. What matters is that
    // the member is never left with less than the month they paid for.
    const end = periodEnd(new Date("2026-01-31T12:00:00Z"), BILLING_INTERVAL.MONTHLY);
    expect(end.getTime()).toBeGreaterThan(new Date("2026-02-28T12:00:00Z").getTime());
  });

  it("does not mutate the date it is given", () => {
    // It takes the caller's `now`, which the callback also writes to the
    // payment row. Mutating it would misdate the receipt.
    const from = new Date("2026-09-05T12:00:00Z");
    periodEnd(from, BILLING_INTERVAL.ANNUAL);
    expect(from.toISOString()).toBe("2026-09-05T12:00:00.000Z");
  });

  it("handles a leap day by landing on a real date", () => {
    const end = periodEnd(new Date("2028-02-29T12:00:00Z"), BILLING_INTERVAL.ANNUAL);
    expect(Number.isNaN(end.getTime())).toBe(false);
    expect(end.getUTCFullYear()).toBe(2029);
  });
});
