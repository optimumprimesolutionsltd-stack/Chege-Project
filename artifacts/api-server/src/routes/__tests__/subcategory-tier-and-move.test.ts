import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/budget-categories.ts", "utf8");
const mobile = readFileSync("../mobile-budget/app/(tabs)/budget.tsx", "utf8");
const web = readFileSync("../family-budget/src/pages/budget.tsx", "utf8");

// Tiers rank what gets funded first. A subcategory is part of whatever its
// parent is, so asking for its tier separately only ever produced a
// contradiction to explain away — a Tier 5 Groceries inside a Tier 1 Food.
describe("a subcategory takes its parent's tier", () => {
  it("sets it from the parent when one is created", () => {
    expect(route).toContain("const inherited = parsed.data.parentId != null");
    expect(route).toContain("...(inherited != null ? { priority: inherited } : {})");
  });

  it("sets it again when one is moved, so it cannot keep the old rank", () => {
    expect(route).toContain("const movedUnder = merged.data.parentId ?? null;");
    expect(route).toContain("const inherited = movedUnder != null ? await parentPriority(tx, groupId, movedUnder) : null;");
  });

  it("reads the parent inside the same transaction as the write", () => {
    expect(route).toContain("await parentPriority(tx, groupId,");
    expect(route).not.toContain("await parentPriority(db, groupId,");
  });

  it("stops asking for it on both clients", () => {
    expect(mobile).toContain('testID="inherited-tier-note"');
    expect(web).toContain('data-testid="inherited-tier-note"');
    // The web wraps the sentence across lines, so the shared part is the tail.
    for (const source of [mobile, web]) {
      expect(source).toContain("separately would only contradict itself.");
    }
  });
});

// The web has had an "Inside another category" select all along. The phone had
// none, so a subcategory could be created there but never moved.
describe("a subcategory can be moved to a different parent", () => {
  it("offers the choice on the phone", () => {
    expect(mobile).toContain('testID="category-parent-none"');
    expect(mobile).toContain("testID={`category-parent-${row.id}`}");
  });

  it("offers only top-level categories, and never itself", () => {
    // Nesting goes one level deep, so a subcategory cannot be a parent, and a
    // category cannot be moved inside itself.
    expect(mobile).toContain("(row.parentId ?? null) === null && row.id !== editTarget?.id");
  });

  it("hides the choice for a category that already holds subcategories", () => {
    expect(mobile).toContain("{!editingParent && !recurringSetupActive ? (");
  });

  it("sends the parent on every save, so it can be cleared as well as set", () => {
    // Omitting it when empty would leave a category stuck where it was. A
    // group sends null regardless: it is top-level by definition.
    expect(mobile).toContain("parentId: formIsGroup ? null : formParentId,");
    expect(mobile).toContain("setFormParentId(cat.parentId ?? null);");
  });

  it("no longer tells people the parent keeps the budget", () => {
    // It does not: since #222 the parent's figure is its subcategories added up.
    for (const source of [mobile, web]) {
      expect(source).not.toContain("The bigger category keeps its budget");
    }
    expect(web).toContain("becomes a heading that totals everything inside it");
  });
});
