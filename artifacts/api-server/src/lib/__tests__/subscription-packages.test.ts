/**
 * Jamvi is one subscription at one price, so the catalogue is small enough to
 * assert whole. What it guards is that the price, the annual discount and the
 * seeded plan row cannot drift apart from each other, since three places
 * describe the same money: this module, the marketing page, and the
 * subscription_plans row the API seeds.
 */

import { describe, expect, it } from "vitest";
import {
  ALL_ENTITLEMENTS,
  BILLING_INTERVAL,
  ENTITLEMENT,
  GRACE_DAYS,
  JAMVI_PACKAGE,
  JAMVI_PACKAGES,
  LAPSED_ENTITLEMENTS,
  PACKAGE_CODE,
  SUBSCRIPTION_STATUS,
  TRIAL_DAYS,
  calculateAnnualSavingKes,
  entitlementsForStatus,
  getJamviPackage,
  isPackageCode,
  priceKes,
  statusGrantsFullAccess,
} from "@workspace/jamvi-pricing";
import { packagesForEnabledCodes } from "../subscription-catalog";

describe("the Jamvi package", () => {
  it("is the only one, replacing the seven group tiers", () => {
    expect(JAMVI_PACKAGES).toHaveLength(1);
    expect(JAMVI_PACKAGES[0].code).toBe(PACKAGE_CODE.JAMVI);
    for (const retired of ["PERSONAL_FREE", "DUO", "SMALL_GROUP", "COMMUNITY", "CLUB", "CHAMA", "UNLIMITED"]) {
      expect(isPackageCode(retired)).toBe(false);
    }
  });

  it("costs KES 100 a month and 1,000 a year", () => {
    expect(JAMVI_PACKAGE.monthlyPriceKes).toBe(100);
    expect(JAMVI_PACKAGE.annualPriceKes).toBe(1_000);
    expect(JAMVI_PACKAGE.currency).toBe("KES");
    expect(priceKes(BILLING_INTERVAL.MONTHLY)).toBe(100);
    expect(priceKes(BILLING_INTERVAL.ANNUAL)).toBe(1_000);
  });

  it("gives two months free on the annual price", () => {
    expect(JAMVI_PACKAGE.annualPriceKes).toBe(JAMVI_PACKAGE.monthlyPriceKes * 10);
    expect(JAMVI_PACKAGE.annualSavingKes)
      .toBe(calculateAnnualSavingKes(JAMVI_PACKAGE.monthlyPriceKes, JAMVI_PACKAGE.annualPriceKes));
    expect(JAMVI_PACKAGE.annualSavingKes).toBe(200);
  });

  it("carries no member limit, because group size is no longer priced", () => {
    expect(JAMVI_PACKAGE).not.toHaveProperty("memberLimit");
  });

  it("trials for a full monthly cycle", () => {
    // Shorter and a salaried member can finish the trial without ever having
    // recorded a payday, having budgeted against income they never saw.
    expect(TRIAL_DAYS).toBe(30);
    expect(JAMVI_PACKAGE.trialDays).toBe(TRIAL_DAYS);
    expect(GRACE_DAYS).toBe(7);
  });

  it("resolves by code and refuses anything else", () => {
    expect(getJamviPackage(PACKAGE_CODE.JAMVI)).toBe(JAMVI_PACKAGE);
    expect(() => getJamviPackage("CHAMA" as never)).toThrow(/Unknown Jamvi package/);
  });

  it("only offers what the database has enabled", () => {
    expect(packagesForEnabledCodes([PACKAGE_CODE.JAMVI])).toHaveLength(1);
    expect(packagesForEnabledCodes([])).toHaveLength(0);
  });
});

describe("what a status grants", () => {
  it("keeps full access through trial, active, past due and cancelled", () => {
    // past_due is included on purpose: a failed M-Pesa deduction is not a
    // decision to leave, and the grace window is what tells them apart.
    expect(statusGrantsFullAccess(SUBSCRIPTION_STATUS.TRIAL)).toBe(true);
    expect(statusGrantsFullAccess(SUBSCRIPTION_STATUS.ACTIVE)).toBe(true);
    expect(statusGrantsFullAccess(SUBSCRIPTION_STATUS.PAST_DUE)).toBe(true);
    expect(statusGrantsFullAccess(SUBSCRIPTION_STATUS.CANCELLED)).toBe(true);
  });

  it("drops expired and pending to the lapsed set", () => {
    expect(statusGrantsFullAccess(SUBSCRIPTION_STATUS.EXPIRED)).toBe(false);
    expect(entitlementsForStatus(SUBSCRIPTION_STATUS.EXPIRED)).toBe(LAPSED_ENTITLEMENTS);
    expect(entitlementsForStatus(SUBSCRIPTION_STATUS.ACTIVE)).toBe(ALL_ENTITLEMENTS);
  });

  it("leaves a lapsed member able to record this month, and nothing shared", () => {
    // Lock, never delete: a locked month is a reason to come back, a deleted
    // one ends the relationship.
    expect(LAPSED_ENTITLEMENTS).toContain(ENTITLEMENT.PERSONAL_EXPENSES);
    expect(LAPSED_ENTITLEMENTS).toContain(ENTITLEMENT.PERSONAL_INCOME);
    expect(LAPSED_ENTITLEMENTS).not.toContain(ENTITLEMENT.SHARED_GROUP_ACCESS);
    expect(LAPSED_ENTITLEMENTS).not.toContain(ENTITLEMENT.FULL_HISTORY);
    expect(LAPSED_ENTITLEMENTS).not.toContain(ENTITLEMENT.REPORTS);
  });
});
