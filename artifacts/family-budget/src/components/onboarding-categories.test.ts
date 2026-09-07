/**
 * What onboarding offers each kind of person.
 *
 * These lists decide what a new user sees on their second screen, and anything
 * absent is effectively absent from their budget - most people take what they
 * are given and never add a category by hand. So the cases worth pinning are
 * the omissions, not the contents.
 */

import { describe, expect, it } from "vitest";
import { ONBOARDING_CATEGORY_TIERS, PURPOSE_CATEGORY_MAP } from "./budget-chooser";

const tierOf = (category: string) =>
  ONBOARDING_CATEGORY_TIERS.find((tier) => tier.categories.includes(category))?.priority;

describe("what each persona is offered", () => {
  it("offers a working person the money they send home", () => {
    // For a great many working Kenyans this is the largest planned expense of
    // the month. It was offered only to families, as though somebody
    // supporting their parents from a single room were not doing the same
    // thing - and its absence is exactly what makes a budget stop balancing.
    expect(PURPOSE_CATEGORY_MAP.working).toContain("Family support");
  });

  it("offers a working person their loan repayments", () => {
    expect(PURPOSE_CATEGORY_MAP.working).toContain("Loans");
    expect(PURPOSE_CATEGORY_MAP.business).toContain("Loans");
  });

  it("offers airtime and data to everyone who buys it", () => {
    for (const persona of ["student", "working", "business"] as const) {
      expect(PURPOSE_CATEGORY_MAP[persona]).toContain("Airtime & data");
    }
  });

  it("does not file a loan repayment as optional spending", () => {
    // Tier 4 is "Optional spending and future plans", and the priority is
    // stored on the category, so filing it there tells the app this is the
    // first thing to cut. Missing a repayment gets you listed with a credit
    // reference bureau; it is nearer to rent than to entertainment.
    expect(tierOf("Loans")).toBe(2);
    expect(tierOf("Loans")).not.toBe(4);
  });

  it("gives every persona a way out through Other", () => {
    for (const [persona, categories] of Object.entries(PURPOSE_CATEGORY_MAP)) {
      if (persona === "family") continue; // Household stands in for it there.
      expect(categories).toContain("Other");
    }
  });

  it("only ever offers categories that exist in a tier", () => {
    // A name that matches no tier falls back to priority 4 silently, so a
    // typo here would quietly file something essential under Flexible.
    const known = new Set(ONBOARDING_CATEGORY_TIERS.flatMap((tier) => tier.categories));
    for (const [persona, categories] of Object.entries(PURPOSE_CATEGORY_MAP)) {
      for (const category of categories) {
        expect(known, `${persona} offers unknown category "${category}"`).toContain(category);
      }
    }
  });

  it("puts no category in two tiers, which would make its priority arbitrary", () => {
    const seen = new Map<string, number>();
    for (const tier of ONBOARDING_CATEGORY_TIERS) {
      for (const category of tier.categories) {
        expect(seen.has(category), `"${category}" is in two tiers`).toBe(false);
        seen.set(category, tier.priority);
      }
    }
  });
});
