import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  budgetChooserCompletionKey,
  canonicalCategoryName,
  dedupeCategoryNames,
  dedupeIncomeStreamNames,
  getInitialOnboardingMode,
  hasCompletedBudgetChooser,
  hasSavedOnboardingDraft,
  normalizeIncomeStreamName,
  onboardingDraftStorageKey,
  personalBudgetEmptyState,
  shouldOfferSharedGroupForm,
} from "./budget-chooser";

describe("budget chooser completion", () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = new Map();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => values.get(key) ?? null,
          setItem: (key: string, value: string) => values.set(key, value),
          removeItem: (key: string) => values.delete(key),
        },
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("uses a user-specific, safely encoded key", () => {
    expect(budgetChooserCompletionKey("member/a")).toBe("jamvi:budget-chooser:completed:member%2Fa");
    window.localStorage.setItem(budgetChooserCompletionKey("member/a"), "true");
    expect(hasCompletedBudgetChooser("member/a")).toBe(true);
    expect(hasCompletedBudgetChooser("member b")).toBe(false);
  });

  it("recognizes an unfinished user-specific onboarding draft", () => {
    window.localStorage.setItem(onboardingDraftStorageKey("member/a"), JSON.stringify({ stage: "income" }));
    expect(hasSavedOnboardingDraft("member/a")).toBe(true);
    expect(hasSavedOnboardingDraft("member b")).toBe(false);
  });

  it("does not bypass the chooser when browser storage cannot be read", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: () => {
            throw new Error("Storage unavailable");
          },
        },
      },
    });
    expect(hasCompletedBudgetChooser("member")).toBe(false);
  });

  it("sends completed returning users directly to budget selection", () => {
    expect(getInitialOnboardingMode(true)).toBe("returning");
    expect(getInitialOnboardingMode(false)).toBeNull();
  });

  it("collapses semantic category aliases into one canonical recommendation", () => {
    expect(canonicalCategoryName(" rent ")).toBe("Housing");
    expect(dedupeCategoryNames(["Food", "Food & meals", "Groceries", "Housing", "Accommodation", "Rent"])).toEqual(["Food", "Housing"]);
  });

  it("deduplicates income streams regardless of case or surrounding whitespace", () => {
    expect(normalizeIncomeStreamName(" Salary Or Wages ")).toBe("salary or wages");
    expect(dedupeIncomeStreamNames([
      "Salary or wages",
      " salary OR WAGES ",
      "Freelance work",
    ])).toEqual(["Salary or wages", "Freelance work"]);
  });
});

describe("shared-only onboarding is never stuck waiting on a Personal budget", () => {
  it("treats a missing Personal budget as by-design, not pending, for shared mode", () => {
    expect(personalBudgetEmptyState("shared")).toBe("not-created-by-design");
  });

  it("treats a missing Personal budget as still preparing for every other mode", () => {
    expect(personalBudgetEmptyState("personal")).toBe("preparing");
    expect(personalBudgetEmptyState("both")).toBe("preparing");
    expect(personalBudgetEmptyState("returning")).toBe("preparing");
    expect(personalBudgetEmptyState(null)).toBe("preparing");
  });

  it("offers the Shared group form for shared or both mode with no group yet, regardless of a Personal budget", () => {
    // This is the exact bug: requiring a Personal budget first made the form
    // permanently unreachable for someone who picked "shared", since one is
    // never created for that mode.
    expect(shouldOfferSharedGroupForm("shared", 0)).toBe(true);
    expect(shouldOfferSharedGroupForm("both", 0)).toBe(true);
  });

  it("does not offer the Shared group form once a group already exists, or for personal-only mode", () => {
    expect(shouldOfferSharedGroupForm("shared", 1)).toBe(false);
    expect(shouldOfferSharedGroupForm("both", 1)).toBe(false);
    expect(shouldOfferSharedGroupForm("personal", 0)).toBe(false);
    expect(shouldOfferSharedGroupForm("returning", 0)).toBe(false);
    expect(shouldOfferSharedGroupForm(null, 0)).toBe(false);
  });
});
