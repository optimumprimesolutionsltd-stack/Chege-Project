import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ONBOARDING_SUBCATEGORIES as PHONE_SUBCATEGORIES } from "../../../mobile-budget/lib/onboarding";
import { ONBOARDING_CATEGORY_TIERS } from "@/components/budget-chooser";
import {
  ONBOARDING_SUBCATEGORIES,
  newSubcategoryError,
  onboardingSubcategoriesFor,
  plannedCategoryAmount,
  readCustomSubcategories,
  readSubcategoryBudgets,
  subcategoryPayload,
} from "./onboarding-subcategories";

const chooserSource = readFileSync("src/components/budget-chooser.tsx", "utf8");

describe("web onboarding subcategories", () => {
  it("offers exactly the phone's subcategories", () => {
    expect(ONBOARDING_SUBCATEGORIES).toEqual(PHONE_SUBCATEGORIES);
  });

  it("opens every category the web offers into subcategories", () => {
    const offered = ONBOARDING_CATEGORY_TIERS.flatMap((tier) => tier.categories);
    expect(offered.filter((category) => onboardingSubcategoriesFor(category).length === 0)).toEqual([]);
  });

  it("plans a category only through its subcategories, including ones the person added", () => {
    const budgets = { Food: { Groceries: "8000", "Eating out": "1500" }, Farm: { Seeds: "300", Stray: "50" } };
    const added = { Farm: ["Seeds"] };
    expect(plannedCategoryAmount("Food", budgets, added)).toBe(9500);
    expect(plannedCategoryAmount("Farm", budgets, added)).toBe(300);
    expect(plannedCategoryAmount("Pets", budgets, added)).toBe(0);
    expect(subcategoryPayload("Farm", budgets, added)).toEqual([{ name: "Seeds", plannedAmount: 300 }]);
    expect(subcategoryPayload("Pets", budgets, added)).toEqual([]);
  });

  it("refuses a subcategory name already in the plan", () => {
    expect(newSubcategoryError("groceries", ["Food"], {})).toBe("groceries is already in this plan.");
    expect(newSubcategoryError("Food", ["Food"], {})).toBe("Food is already in this plan.");
    expect(newSubcategoryError("  ", ["Food"], {})).not.toBeNull();
    expect(newSubcategoryError("Seeds", ["Food", "Farm"], {})).toBeNull();
  });

  it("keeps only well-formed entries from a saved draft", () => {
    expect(readSubcategoryBudgets({ Food: { Groceries: "8000", Bad: 3 }, Junk: 4 })).toEqual({ Food: { Groceries: "8000" } });
    expect(readCustomSubcategories({ Farm: ["Seeds", 3, " "], Junk: "x" })).toEqual({ Farm: ["Seeds"] });
  });

  it("has no amount box on a category on the amounts step, only on its subcategories", () => {
    expect(chooserSource).not.toContain("id={`budget-${category}`}");
    expect(chooserSource).toContain("id={`budget-${category}-${child}`}");
    expect(chooserSource).toContain("subcategories: subcategoryPayload(name, subcategoryBudgets, customSubcategories)");
  });
});
