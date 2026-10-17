import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanEarnsFrom } from "../business-streams";

const src = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8");

// "why not change the name from dahanak sales to rental income" / "we need to
// have an option to add more..not just sales and rent" (17 Oct 2026).
describe("what a business earns from", () => {
  it("keeps sales and rent as keys, anything else as typed, tidied", () => {
    expect(cleanEarnsFrom(" Sales ")).toBe("sales");
    expect(cleanEarnsFrom("Rental income")).toBe("rent");
    expect(cleanEarnsFrom("  consulting   fees ")).toBe("consulting fees");
    expect(cleanEarnsFrom("x".repeat(60))).toHaveLength(40);
  });

  it("is kept per business, sales unless set", () => {
    const lib = src("lib/business-streams.ts");
    expect(lib).toContain(`ADD COLUMN IF NOT EXISTS "earns_from" text`);
    expect(lib).toContain(`earnsFrom: row.earnsFrom?.trim() ? cleanEarnsFrom(row.earnsFrom) : "sales"`);
    expect(lib).toContain('...(earnsFrom === undefined ? [] : [sql`"earns_from" = ${earnsFrom}`]),');
  });

  it("is set through PUT /businesses/:id", () => {
    const route = src("routes/businesses.ts");
    expect(route).toContain("earnsFrom: z.string().trim().min(1).max(EARNS_FROM_MAX).transform(cleanEarnsFrom).optional()");
    expect(route).toContain("parsed.data.paysSalary, parsed.data.earnsFrom))");
  });
});
