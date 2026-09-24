import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// Web counterpart of the phone's category search box.
describe("the web category lists have a search box", () => {
  it.each([
    ["./bank.tsx", 3],
    ["./bank-day.tsx", 1],
    ["./expenses.tsx", 1],
    ["./dashboard.tsx", 1],
    ["./budget.tsx", 1],
  ])("%s", (file, count) => {
    expect(read(file).split("<CategorySearchInput").length - 1).toBe(count);
  });

  it("keeps the chosen category in a filtered select", () => {
    const source = read("../components/category-search.tsx");
    expect(source).toContain("filterCategoryTree(tree, query)");
    expect(source).toContain("visible(selected");
  });

  it("filters with the same helper as the phone", () => {
    expect(read("../components/category-search.tsx")).toContain('from "@workspace/category-tree"');
  });
});
