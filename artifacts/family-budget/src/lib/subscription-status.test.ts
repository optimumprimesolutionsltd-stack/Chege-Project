/**
 * What the subscription screen tells a member.
 *
 * This is the wording someone reads before deciding whether to come back, so
 * it is worth pinning. The case that matters most is the lapsed one: a member
 * who reads that their data has been removed does not return, and the model
 * depends on them being able to.
 */

import { describe, expect, it } from "vitest";
import { daysUntil, statusLine, type MemberEntitlements } from "./subscription-status";

const NOW = new Date("2026-09-05T12:00:00Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

function member(overrides: Partial<MemberEntitlements> = {}): MemberEntitlements {
  return {
    packageCode: "JAMVI",
    packageName: "Jamvi",
    fullAccess: true,
    status: "active",
    billingInterval: "monthly",
    trialEndsAt: null,
    currentPeriodEnd: null,
    ...overrides,
  };
}

describe("daysUntil", () => {
  it("rounds up, so a few hours left still reads as a day", () => {
    expect(daysUntil(inDays(0.2), NOW)).toBe(1);
  });

  it("returns null for nothing and for nonsense", () => {
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil("not a date", NOW)).toBeNull();
  });

  it("goes negative once the date has passed", () => {
    expect(daysUntil(inDays(-3), NOW)).toBeLessThan(0);
  });
});

describe("statusLine", () => {
  it("tells a lapsed member nothing has been removed", () => {
    const { heading, detail } = statusLine(
      member({ fullAccess: false, status: "expired" }),
      NOW,
    );

    expect(heading).toMatch(/lapsed/i);
    expect(detail).toMatch(/nothing has been removed/i);
    expect(detail).toMatch(/read-only/i);
    expect(detail).not.toMatch(/delet|remov(ed|ing) your|lost/i);
  });

  it("says lapsed before anything else, whatever the status column says", () => {
    // Access is computed from dates, so a row can still read "trial" long
    // after the trial ended. The member is told what is true.
    const { heading } = statusLine(
      member({ fullAccess: false, status: "trial", trialEndsAt: inDays(-40) }),
      NOW,
    );

    expect(heading).toMatch(/lapsed/i);
  });

  it("counts down the free period", () => {
    expect(statusLine(member({ status: "trial", trialEndsAt: inDays(9) }), NOW).heading)
      .toBe("9 days left in your free period");
  });

  it("says day, not days, with one left", () => {
    expect(statusLine(member({ status: "trial", trialEndsAt: inDays(0.5) }), NOW).heading)
      .toBe("1 day left in your free period");
  });

  it("does not promise days it cannot count", () => {
    expect(statusLine(member({ status: "trial", trialEndsAt: null }), NOW).heading)
      .toBe("Your free period is ending");
  });

  it("tells a cancelled member what they still have", () => {
    const { heading, detail } = statusLine(
      member({ status: "cancelled", currentPeriodEnd: inDays(12) }),
      NOW,
    );

    expect(heading).toBe("Cancelled");
    expect(detail).toMatch(/keep everything for another 12 days/i);
  });

  it("does not alarm a member whose payment merely failed", () => {
    // past_due still carries full access through the grace window. Telling
    // them they have lost something would be untrue.
    const { detail } = statusLine(member({ status: "past_due" }), NOW);

    expect(detail).toMatch(/nothing has changed yet/i);
  });

  it("names the right period for an annual subscriber", () => {
    expect(statusLine(
      member({ status: "active", billingInterval: "annual", currentPeriodEnd: inDays(300) }),
      NOW,
    ).detail).toMatch(/your year runs for another 300 days/i);
  });
});
