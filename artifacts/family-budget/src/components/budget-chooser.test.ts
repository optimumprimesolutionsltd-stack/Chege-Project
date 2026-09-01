import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  budgetChooserCompletionKey,
  dedupeIncomeStreamNames,
  getInitialOnboardingMode,
  hasCompletedBudgetChooser,
  normalizeIncomeStreamName,
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

  it("deduplicates income streams regardless of case or surrounding whitespace", () => {
    expect(normalizeIncomeStreamName(" Salary Or Wages ")).toBe("salary or wages");
    expect(dedupeIncomeStreamNames([
      "Salary or wages",
      " salary OR WAGES ",
      "Freelance work",
    ])).toEqual(["Salary or wages", "Freelance work"]);
  });
});
