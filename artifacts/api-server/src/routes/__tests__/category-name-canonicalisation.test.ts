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
  it("folds nothing, so a refinement can be created under its parent", () => {
    // The fold shipped in #226 and was wrong within hours: it made "Rent under
    // Housing" impossible, because the name became "Housing" and collided.
    expect(canonicalExpenseCategoryName("Rent")).toBe("Rent");
    expect(canonicalExpenseCategoryName("  accommodation ")).toBe("accommodation");
  });

  it("leaves an ordinary name alone", () => {
    expect(canonicalExpenseCategoryName("Transport")).toBe("Transport");
    expect(canonicalExpenseCategoryName("Shopping")).toBe("Shopping");
  });

  it("still applies the (now empty) fold when creating", () => {
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

  it("keeps the map empty, because every candidate turned out to be a refinement", () => {
    expect(names).toContain("const EXPENSE_CATEGORY_ALIASES: Record<string, string> = {};");
  });

  it("says why it is empty rather than looking merely unfinished", () => {
    expect(names).toContain("Deliberately empty.");
    expect(names).toContain("never does.");
    // The reason has to survive, or somebody refills the map next year.
    expect(names).toContain("Rent under Housing is a sensible");
  });
});
