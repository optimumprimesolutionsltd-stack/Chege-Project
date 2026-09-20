import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/budget-categories.ts", "utf8");
const mobile = readFileSync("../mobile-budget/app/(tabs)/settings.tsx", "utf8");
const web = readFileSync("../family-budget/src/pages/settings.tsx", "utf8");
const spec = readFileSync("../../lib/api-spec/openapi.yaml", "utf8");

// "Add missing categories" listed them in a comma-joined sentence and then
// added every one. Being told what is about to happen is not the same as being
// asked, and a budget is somebody's own vocabulary — the whole pack rarely
// fits.
describe("the recommendations can be chosen from", () => {
  it("takes a list of names, and still adds all when none is given", () => {
    expect(spec).toContain("Omit to add all of them.");
    expect(route).toContain("const chosen = parsed.data.names?.length");
  });

  it("matches the choice against what is actually missing", () => {
    // A stale list must not add something the person was never shown, and a
    // name they already have is skipped rather than duplicated.
    expect(route).toContain(".filter((category) => chosen === null || chosen.has(normalizedCategoryName(category.name)))");
    expect(route).toContain("!existingNames.has(normalizedCategoryName(category.name))");
  });

  it("does not put ledgers under a heading that was declined", () => {
    // Adding the suggested subcategories beneath a category somebody
    // deliberately left out would put back exactly what they declined.
    expect(route).toContain("chosen.has(normalizedCategoryName(name))");
    expect(route).toContain("existingNames.has(normalizedCategoryName(name))");
  });
});

describe("and both clients ask rather than tell", () => {
  it("names each one on its own row with a tick", () => {
    expect(mobile).toContain("testID={`recommendation-${item.name}`}");
    expect(web).toContain("data-testid={`recommendation-${recommendation.name}`}");
    expect(mobile).toContain('accessibilityRole="checkbox"');
  });

  it("starts with everything ticked, so one tap still adds the lot", () => {
    for (const source of [mobile, web]) {
      expect(source).toContain("const selectedRecommendations = chosenRecommendations");
    }
  });

  it("sends only what was ticked", () => {
    expect(mobile).toContain("names: selectedRecommendations");
    expect(web).toContain("names: selectedRecommendations");
  });

  it("refuses to add nothing", () => {
    for (const source of [mobile, web]) {
      expect(source).toContain("selectedRecommendations.length === 0");
      expect(source).toContain("Tick at least one");
    }
  });

  it("counts what it is about to add, rather than what was missing", () => {
    for (const source of [mobile, web]) {
      expect(source).toContain("Add ${selectedRecommendations.length} categor");
    }
  });

  it("forgets the selection once it is applied", () => {
    // The next visit starts from whatever is missing then, not from a stale
    // set of ticks.
    for (const source of [mobile, web]) {
      expect(source).toContain("setChosenRecommendations(null);");
    }
  });
});
