import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalExpenseCategoryName } from "../../lib/categoryNames.js";

const route = readFileSync("src/routes/budget-categories.ts", "utf8");
const names = readFileSync("src/lib/categoryNames.ts", "utf8");
const onboarding = readFileSync("../mobile-budget/lib/onboarding.ts", "utf8");

// Expenses have always been stored under the canonical name, but categories
// were not. So a category created as "Rent" could never collect any spending:
// every expense tagged to it was filed as "Housing". It sat at zero while the
// money showed up elsewhere, and the group ended up holding two categories for
// one thing — which is exactly what production looked like.
describe("a category is created under the name its expenses will use", () => {
  it("folds an alias into the name expenses already use", () => {
    expect(canonicalExpenseCategoryName("Rent")).toBe("Housing");
    expect(canonicalExpenseCategoryName("  accommodation ")).toBe("Housing");
  });

  it("leaves an ordinary name alone", () => {
    expect(canonicalExpenseCategoryName("Transport")).toBe("Transport");
    expect(canonicalExpenseCategoryName("Shopping")).toBe("Shopping");
  });

  it("applies it when creating", () => {
    expect(route).toContain("const canonicalName = canonicalExpenseCategoryName(requestedName);");
    expect(route).toContain("parsed.data.name = canonicalName;");
  });

  it("applies it when renaming, or the same gap reopens", () => {
    expect(route).toContain("merged.data.name = canonicalName;");
  });

  it("names both when the canonical one is already there", () => {
    // Saying "this name already exists" about a name they did not type reads
    // as a bug.
    expect((route.match(/is recorded as/g) ?? []).length).toBe(2);
    expect(route).toContain("which this budget already has.");
  });
});

// The trap: onboarding's map also folds "groceries" into Food. That was right
// when categories were a flat list and wrong now.
describe("a subcategory is not an alias", () => {
  it("never folds Groceries into Food", () => {
    // Groceries is a subcategory of Food. Folding it away here would make it
    // impossible to create one.
    expect(canonicalExpenseCategoryName("Groceries")).toBe("Groceries");
  });

  it("keeps this map to true synonyms only", () => {
    // Scoped to the map itself — the comment above it names "groceries" while
    // explaining precisely why it is not in here.
    const map = names.slice(
      names.indexOf("EXPENSE_CATEGORY_ALIASES"),
      names.indexOf("};", names.indexOf("EXPENSE_CATEGORY_ALIASES")),
    );
    expect(map).not.toContain("groceries");
    expect(map).toContain("rent:");
    expect(map).toContain("accommodation:");
  });

  it("says why it differs from onboarding, which does fold it", () => {
    // Without the note, the two maps look like one of them is simply stale.
    expect(onboarding).toContain("groceries: \"Food\"");
    expect(names).toContain("ONBOARDING_CATEGORY_ALIASES");
    expect(names).toContain("never a refinement of a broader category");
  });
});
