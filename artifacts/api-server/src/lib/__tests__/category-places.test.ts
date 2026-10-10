import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(__dirname, path), "utf8");

describe("at home or outside, kept for Reports", () => {
  it("keeps only the side a person chose, and goes with its category", () => {
    const places = read("../category-places.ts");
    expect(places).toContain('"category_id" integer PRIMARY KEY REFERENCES "budget_categories"("id") ON DELETE CASCADE');
    expect(places).toContain('"at_home" boolean NOT NULL');
    // Another budget's category is never touched.
    expect(places).toContain("SELECT 1 FROM budget_categories WHERE id = ${categoryId} AND group_id = ${groupId}");
    // Null puts it back to Jamvi's own side.
    expect(places).toContain("DELETE FROM category_places WHERE category_id = ${categoryId} AND group_id = ${groupId}");
  });

  it("is read by any member, set by a manager, and made at start-up", () => {
    const route = read("../../routes/category-places.ts");
    expect(route).toContain('router.get("/category-places"');
    expect(route).toContain("if (!requireGroupManager(req, res)) return;");
    expect(route).toContain("atHome: z.boolean().nullable()");
    expect(read("../../routes/index.ts")).toContain("router.use(categoryPlacesRouter);");
    expect(read("../../index.ts")).toContain("void ensureCategoryPlaces();");
  });
});
