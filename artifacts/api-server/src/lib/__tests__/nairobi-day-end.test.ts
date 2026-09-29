import { describe, expect, it } from "vitest";
import { endOfNairobiDay } from "../nairobiTime";
import { planFor } from "../subscription-lifecycle";

// "The time zone is still not ok. Trial days are expiring before midnight."
describe("a trial, paid month or grace period", () => {
  it("ends at midnight in Nairobi on its last day, not at the time of day it began", () => {
    // 15:30 in Nairobi on 1 Oct is 12:30 UTC; it runs to midnight Nairobi = 21:00 UTC.
    expect(endOfNairobiDay(new Date("2026-10-01T12:30:00Z")).toISOString()).toBe("2026-10-01T21:00:00.000Z");
    // 01:00 in Nairobi on 2 Oct is 22:00 UTC on 1 Oct: still the 2nd there.
    expect(endOfNairobiDay(new Date("2026-10-01T22:00:00Z")).toISOString()).toBe("2026-10-02T21:00:00.000Z");
    expect(endOfNairobiDay(new Date("2026-10-01T21:00:00Z")).toISOString()).toBe("2026-10-01T21:00:00.000Z");
  });

  it("is still a trial at 11pm on its last day, stored before this rule at mid-afternoon", () => {
    const trial = { status: "trial", trialEndsAt: new Date("2026-10-01T12:30:00Z"), currentPeriodEnd: null, graceEndsAt: null } as never;
    expect(planFor(trial, new Date("2026-10-01T20:00:00Z")).transition).toBeNull();
    expect(planFor(trial, new Date("2026-10-01T21:00:00Z")).transition).toMatchObject({ status: "expired" });
  });
});
