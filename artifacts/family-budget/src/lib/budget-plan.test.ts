import { describe, expect, it } from "vitest";
import { budgetDurationEditError, budgetDurationLabels } from "./budget-plan";

describe("editing a budget plan's duration after setup", () => {
  it("allows any non-custom duration regardless of end date", () => {
    expect(budgetDurationEditError("ongoing", "")).toBeNull();
    expect(budgetDurationEditError("week", "")).toBeNull();
    expect(budgetDurationEditError("month", "")).toBeNull();
    expect(budgetDurationEditError("quarter", "")).toBeNull();
  });

  it("requires an end date for a custom duration", () => {
    expect(budgetDurationEditError("custom", "")).toBe("Choose an end date for this budget.");
  });

  it("rejects a custom end date that is today or in the past", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(budgetDurationEditError("custom", today)).toBe("Choose an end date in the future.");
  });

  it("accepts a custom end date in the future", () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    expect(budgetDurationEditError("custom", future.toISOString().slice(0, 10))).toBeNull();
  });
});

describe("budgetDurationLabels", () => {
  it('calls the ongoing option "budgeting" for a personal account', () => {
    expect(budgetDurationLabels(false).ongoing.title).toBe("Everyday budgeting");
  });

  it('calls the ongoing option "contributions" for a shared group, not "budgeting"', () => {
    const label = budgetDurationLabels(true).ongoing;
    expect(label.title).toBe("Everyday contributions");
    expect(label.title.toLowerCase()).not.toContain("budgeting");
    expect(label.description.toLowerCase()).not.toContain("budgeting");
  });

  it("leaves every other duration option worded the same regardless of context", () => {
    const personal = budgetDurationLabels(false);
    const shared = budgetDurationLabels(true);
    for (const key of ["week", "month", "quarter", "custom"] as const) {
      expect(shared[key]).toEqual(personal[key]);
    }
  });
});
