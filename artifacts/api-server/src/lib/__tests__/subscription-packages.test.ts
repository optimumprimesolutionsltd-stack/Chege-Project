import { describe, expect, it } from "vitest";
import {
  JAMVI_PACKAGES,
  PACKAGE_CODE,
  calculateAnnualSavingKes,
  getJamviPackage,
} from "@workspace/jamvi-pricing";
import {
  packagesForEnabledCodes,
  resolveUserEntitlements,
  subscriptionStatusGrantsEntitlements,
} from "../subscription-catalog";

describe("Jamvi subscription packages", () => {
  it("contains exactly the seven approved package codes in display order", () => {
    expect(JAMVI_PACKAGES.map((plan) => plan.code)).toEqual([
      PACKAGE_CODE.PERSONAL_FREE,
      PACKAGE_CODE.DUO,
      PACKAGE_CODE.SMALL_GROUP,
      PACKAGE_CODE.COMMUNITY,
      PACKAGE_CODE.CLUB,
      PACKAGE_CODE.CHAMA,
      PACKAGE_CODE.UNLIMITED,
    ]);
  });

  it.each([
    [PACKAGE_CODE.PERSONAL_FREE, "Personal Free", 0, 0, 1, null],
    [PACKAGE_CODE.DUO, "Jamvi Duo", 300, 3_000, 2, 600],
    [PACKAGE_CODE.SMALL_GROUP, "Jamvi Small Group", 500, 5_000, 6, 1_000],
    [PACKAGE_CODE.COMMUNITY, "Jamvi Community", 1_000, 10_000, 15, 2_000],
    [PACKAGE_CODE.CLUB, "Jamvi Club", 1_500, 15_000, 30, 3_000],
    [PACKAGE_CODE.CHAMA, "Jamvi Chama", 2_000, 20_000, 50, 4_000],
    [PACKAGE_CODE.UNLIMITED, "Jamvi Unlimited", 5_000, 50_000, null, 10_000],
  ] as const)(
    "%s keeps its approved name, prices, limit, and annual saving",
    (code, displayName, monthly, annual, memberLimit, saving) => {
      expect(getJamviPackage(code)).toMatchObject({
        displayName,
        monthlyPriceKes: monthly,
        annualPriceKes: annual,
        memberLimit,
        annualSavingKes: saving,
      });
    },
  );

  it("prices every paid annual package at ten monthly payments", () => {
    for (const plan of JAMVI_PACKAGES.filter((item) => !item.personal)) {
      expect(plan.annualPriceKes).toBe(plan.monthlyPriceKes * 10);
      expect(plan.annualSavingKes).toBe(
        calculateAnnualSavingKes(plan.monthlyPriceKes, plan.annualPriceKes),
      );
    }
  });

  it("always resolves Personal Free independently of a Shared subscription", () => {
    expect(resolveUserEntitlements()).toMatchObject({
      packageCode: PACKAGE_CODE.PERSONAL_FREE,
      packageName: "Personal Free",
      billingState: "free",
    });
  });

  it("marks only Small Group as the recommended package", () => {
    expect(JAMVI_PACKAGES.filter((plan) => plan.recommended).map((plan) => plan.code))
      .toEqual([PACKAGE_CODE.SMALL_GROUP]);
  });

  it("hides disabled paid packages from new selections without hiding Personal Free", () => {
    const enabled = packagesForEnabledCodes([
      PACKAGE_CODE.DUO,
      PACKAGE_CODE.SMALL_GROUP,
    ]);
    expect(enabled.map((plan) => plan.code)).toEqual([
      PACKAGE_CODE.PERSONAL_FREE,
      PACKAGE_CODE.DUO,
      PACKAGE_CODE.SMALL_GROUP,
    ]);
  });

  it("does not grant paid entitlements for pending or ended subscriptions", () => {
    expect(subscriptionStatusGrantsEntitlements("pending")).toBe(false);
    expect(subscriptionStatusGrantsEntitlements("cancelled")).toBe(false);
    expect(subscriptionStatusGrantsEntitlements("expired")).toBe(false);
    expect(subscriptionStatusGrantsEntitlements("trial")).toBe(true);
    expect(subscriptionStatusGrantsEntitlements("active")).toBe(true);
    expect(subscriptionStatusGrantsEntitlements("past_due")).toBe(true);
  });
});