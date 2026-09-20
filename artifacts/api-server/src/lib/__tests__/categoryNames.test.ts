import { describe, expect, it } from "vitest";
import { canonicalExpenseCategoryName, normalizeExpenseCategoryName } from "../categoryNames.js";

// "Rent" and "Accommodation" used to be folded into Housing. That was right
// while categories were a flat list, where the two could only ever be
// duplicates of each other. Subcategories changed it: Rent *under* Housing is
// a sensible hierarchy, and folding made it impossible to build — creating
// "Rent" became "Housing", collided with the Housing already there, and was
// refused.
describe("expense category normalization", () => {
  it("leaves a name that is now a subcategory alone", () => {
    expect(canonicalExpenseCategoryName("Rent")).toBe("Rent");
    expect(canonicalExpenseCategoryName("  accommodation ")).toBe("accommodation");
  });

  it("trims ordinary custom categories without changing their meaning", () => {
    expect(canonicalExpenseCategoryName("  School transport ")).toBe("School transport");
    expect(normalizeExpenseCategoryName("  School transport ")).toBe("school transport");
  });

  it("folds nothing at all, so no name can be refused for being a refinement", () => {
    // An expense tagged "Rent" is now stored as "Rent", so the subcategory
    // actually collects it. While the fold was in place it was filed as
    // "Housing" and the subcategory would have stayed empty for ever.
    for (const name of ["Rent", "Groceries", "Dining", "School fees", "Wi-Fi"]) {
      expect(canonicalExpenseCategoryName(name)).toBe(name);
    }
  });
});
