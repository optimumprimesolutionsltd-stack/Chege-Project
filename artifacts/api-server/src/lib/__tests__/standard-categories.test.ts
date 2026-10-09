import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isStandardKey } from "../standard-categories";

const read = (file: string) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

// "All the recognized categories should be as per the app subject to the user changing" (9 Oct 2026).
describe("a budget's common categories", () => {
  it("are kept under keys like eating-out, nothing else", () => {
    expect(isStandardKey("eating-out")).toBe(true);
    expect(isStandardKey("electricity")).toBe(true);
    expect(isStandardKey("Eating out")).toBe(false);
    expect(isStandardKey("")).toBe(false);
    expect(isStandardKey("x".repeat(41))).toBe(false);
    expect(isStandardKey(7)).toBe(false);
  });

  it("are remembered by the category's id, and forgotten when it is deleted", () => {
    const lib = read("src/lib/standard-categories.ts");
    expect(lib).toContain('"category_id" integer NOT NULL REFERENCES "budget_categories"("id") ON DELETE CASCADE');
    expect(lib).toContain('PRIMARY KEY ("group_id", "key")');
    // Only a category of this budget can be remembered for it.
    expect(lib).toContain('SELECT 1 FROM "budget_categories" WHERE "id" = ${categoryId} AND "group_id" = ${groupId} LIMIT 1');
  });

  it("are set only by somebody who may change the budget, and the table is made after the server starts", () => {
    expect(read("src/routes/standard-categories.ts")).toContain("if (!requireGroupManager(req, res)) return;");
    expect(read("src/routes/index.ts")).toContain("router.use(standardCategoriesRouter);");
    expect(read("src/index.ts")).toContain("void ensureStandardCategories();");
  });
});
