import { describe, expect, it } from "vitest";
import { buildCategoryTree, childrenFor, parentOf, type CategoryRow } from "@workspace/category-tree";

// Covers the shared @workspace/category-tree package, which both expense forms
// and the phone's picker read. It lives here because this is where vitest is
// wired up; the package itself carries no test runner of its own.

const FOOD: CategoryRow = { id: 1, name: "Food", parentId: null };
const GROCERIES: CategoryRow = { id: 2, name: "Groceries", parentId: 1 };
const VEGETABLES: CategoryRow = { id: 3, name: "Vegetables", parentId: 1 };
const HOUSING: CategoryRow = { id: 4, name: "Housing", parentId: null };
const OTHER: CategoryRow = { id: 5, name: "Other", parentId: null };

describe("buildCategoryTree", () => {
  it("keeps subcategories under their parent instead of alongside it", () => {
    expect(buildCategoryTree([FOOD, HOUSING, GROCERIES, VEGETABLES])).toEqual([
      { name: "Food", children: ["Groceries", "Vegetables"] },
      { name: "Housing", children: [] },
    ]);
  });

  it("offers only top-level names at the top level", () => {
    const tree = buildCategoryTree([FOOD, GROCERIES, VEGETABLES, HOUSING]);
    expect(tree.map((group) => group.name)).toEqual(["Food", "Housing"]);
  });

  it("drops \"Other\" everywhere, including as a parent", () => {
    const child: CategoryRow = { id: 6, name: "Misc", parentId: OTHER.id };
    const tree = buildCategoryTree([OTHER, FOOD, child]);
    expect(tree.map((group) => group.name)).not.toContain("Other");
    expect(tree).toContainEqual({ name: "Misc", children: [] });
  });

  it("treats a category whose parent is absent as top-level", () => {
    expect(buildCategoryTree([{ id: 7, name: "Orphan", parentId: 999 }])).toEqual([
      { name: "Orphan", children: [] },
    ]);
  });

  it("returns an empty list for no categories", () => {
    expect(buildCategoryTree([])).toEqual([]);
  });
});

describe("parentOf", () => {
  const tree = buildCategoryTree([FOOD, GROCERIES, VEGETABLES, HOUSING]);

  it("names the parent a subcategory sits under", () => {
    expect(parentOf(tree, "Groceries")).toBe("Food");
  });

  it("returns null for a top-level category or one not in the tree", () => {
    expect(parentOf(tree, "Housing")).toBeNull();
    expect(parentOf(tree, "Nonsense")).toBeNull();
    expect(parentOf(tree, "   ")).toBeNull();
  });
});

describe("childrenFor", () => {
  const tree = buildCategoryTree([FOOD, GROCERIES, VEGETABLES, HOUSING]);

  it("lists a parent's subcategories", () => {
    expect(childrenFor(tree, "Food")).toEqual(["Groceries", "Vegetables"]);
  });

  it("still lists the siblings when a child is what is selected", () => {
    expect(childrenFor(tree, "Groceries")).toEqual(["Groceries", "Vegetables"]);
  });

  it("is empty for a childless or unknown category", () => {
    expect(childrenFor(tree, "Housing")).toEqual([]);
    expect(childrenFor(tree, "")).toEqual([]);
  });
});
