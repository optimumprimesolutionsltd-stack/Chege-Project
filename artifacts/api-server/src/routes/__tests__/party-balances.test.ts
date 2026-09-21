import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("../../lib/db/src/schema/budget.ts", "utf8");
const migration = readFileSync("../../lib/db/migrations/0037_contributors_become_parties.sql", "utf8");
const journal = readFileSync("../../lib/db/migrations/meta/_journal.json", "utf8");
const route = readFileSync("src/routes/contributors.ts", "utf8");

// Debtors and creditors are people or institutions, not things. A contributor
// row was already a person rather than an account — name, login only if they
// happen to have one — which is exactly what a debtor is. So the concept is
// widened rather than duplicated.
describe("a contributor becomes a party", () => {
  it("can be an institution, which never has a login", () => {
    expect(schema).toContain('kind: text("kind").notNull().default("person")');
    expect(schema).toContain(`sql\`\${table.kind} IN ('person', 'institution')\``);
  });

  it("holds the two directions apart rather than netting them", () => {
    // A chama member can owe the kitty and be owed by it at once, and a single
    // signed figure would hide both.
    expect(schema).toContain('owedToUs: integer("owed_to_us")');
    expect(schema).toContain('owedByUs: integer("owed_by_us")');
  });

  it("refuses a negative balance in either direction", () => {
    // Owing minus five thousand is not a thing; it is being owed five thousand,
    // and saying it the other way would put it in the wrong column.
    expect(schema).toContain('sql`${table.owedToUs} IS NULL OR ${table.owedToUs} >= 0`');
    expect(schema).toContain('sql`${table.owedByUs} IS NULL OR ${table.owedByUs} >= 0`');
  });

  it("leaves every existing row meaning what it meant", () => {
    // Everyone already recorded is a person, and a balance never set is null
    // rather than zero: null is not tracked, zero is a debt cleared.
    expect(migration).toContain(`ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'person'`);
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "owed_to_us" integer');
    expect(migration).not.toContain("UPDATE");
  });

  it("can be run twice without complaint", () => {
    // Constraints are added only when absent, so a re-run after a half-finished
    // deploy does not fail on the second attempt.
    expect(migration).toContain("SELECT 1 FROM pg_constraint WHERE conname = 'group_contributors_kind_check'");
  });

  it("is registered after the migration before it", () => {
    const entries = JSON.parse(journal).entries as Array<{ tag: string; when: number }>;
    const mine = entries.find((entry) => entry.tag === "0037_contributors_become_parties");
    const previous = entries.find((entry) => entry.tag === "0036_bank_charges_become_spending");
    expect(mine!.when).toBeGreaterThan(previous!.when);
  });
});

describe("the API carries the balances", () => {
  it("returns both directions, and what kind of party it is", () => {
    expect(route).toContain("kind: contributor.kind,");
    expect(route).toContain("owedToUs: contributor.owedToUs,");
    expect(route).toContain("owedByUs: contributor.owedByUs,");
  });

  it("tells not-tracked from cleared", () => {
    // Explicit null stops tracking; zero is a debt that has been paid off and
    // is worth being able to say.
    expect(route).toContain("owedToUs: z.number().int().min(0).nullable().optional(),");
    expect(route).toContain("if (parsed.data.owedToUs !== undefined) changes.owedToUs = parsed.data.owedToUs;");
  });

  it("never gives an institution a contribution target", () => {
    // A default target on KCB would put it in the arrears column of a chama it
    // has nothing to do with.
    expect(route).toContain('const monthlyTarget = kind === "institution"');
    expect(route).toContain("? (parsed.data.monthlyTarget ?? null)");
  });

  it("creates a party with what stands between you already set", () => {
    expect(route).toContain("owedToUs: parsed.data.owedToUs ?? null,");
    expect(route).toContain("owedByUs: parsed.data.owedByUs ?? null,");
  });
});
