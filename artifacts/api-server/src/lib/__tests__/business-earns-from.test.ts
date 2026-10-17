import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8");

// "why not change the name from dahanak sales to rental income" (17 Oct 2026).
describe("what a business earns from", () => {
  it("is kept per business, sales unless set to rent", () => {
    const lib = src("lib/business-streams.ts");
    expect(lib).toContain(`ADD COLUMN IF NOT EXISTS "earns_from" text`);
    expect(lib).toContain(`earnsFrom: row.earnsFrom === "rent" ? "rent" as const : "sales" as const`);
    expect(lib).toContain('...(earnsFrom === undefined ? [] : [sql`"earns_from" = ${earnsFrom}`]),');
  });

  it("is set through PUT /businesses/:id", () => {
    const route = src("routes/businesses.ts");
    expect(route).toContain("earnsFrom: z.enum(EARNS_FROM as [EarnsFrom, ...EarnsFrom[]]).optional()");
    expect(route).toContain("parsed.data.paysSalary, parsed.data.earnsFrom))");
  });
});
