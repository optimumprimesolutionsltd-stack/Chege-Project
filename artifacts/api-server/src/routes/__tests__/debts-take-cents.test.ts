import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("../../lib/db/src/schema/budget.ts", "utf8");
const migration = readFileSync("../../lib/db/migrations/0041_debts_take_cents.sql", "utf8");
const journal = readFileSync("../../lib/db/migrations/meta/_journal.json", "utf8");
const contributors = readFileSync("src/routes/contributors.ts", "utf8");
const categories = readFileSync("src/routes/budget-categories.ts", "utf8");

// Bank postings have taken two decimals since they existed; what is owed never
// did. So paying KES 1,250.75 off a loan moved the balance by 1,251, and the
// debt drifted by a few shillings every time it was touched — in the one
// figure somebody is actually watching go down.
describe("what is owed takes cents", () => {
  it("is stored the way every other money column already is", () => {
    // numeric(14,2) with mode number, matching opening_balance and the
    // transaction amounts, so nothing downstream learns a new shape.
    expect(schema).toContain('debtBalance: numeric("debt_balance", { precision: 14, scale: 2, mode: "number" })');
    expect(schema).toContain('owedToUs: numeric("owed_to_us", { precision: 14, scale: 2, mode: "number" })');
    expect(schema).toContain('owedByUs: numeric("owed_by_us", { precision: 14, scale: 2, mode: "number" })');
  });

  it("widens all three columns", () => {
    expect(migration).toContain('ALTER COLUMN "debt_balance" TYPE numeric(14, 2)');
    expect(migration).toContain('ALTER COLUMN "owed_to_us" TYPE numeric(14, 2)');
    expect(migration).toContain('ALTER COLUMN "owed_by_us" TYPE numeric(14, 2)');
  });

  it("loses nothing on the way", () => {
    // Integer to numeric is lossless: every whole number stays what it was.
    expect(migration).not.toContain("USING");
    expect(migration).not.toContain("UPDATE");
  });

  it("leaves the checks that already hold alone", () => {
    // owed >= 0 is as true of 0.75 as it was of 1.
    expect(migration).not.toContain("DROP CONSTRAINT");
  });

  it("is registered after the migration before it", () => {
    const entries = JSON.parse(journal).entries as Array<{ tag: string; when: number }>;
    const mine = entries.find((entry) => entry.tag === "0041_debts_take_cents");
    const previous = entries.find((entry) => entry.tag === "0040_borrowing_is_not_income");
    expect(mine!.when).toBeGreaterThan(previous!.when);
  });
});

describe("and the API stops refusing them", () => {
  it("takes two decimals on both party balances", () => {
    expect((contributors.match(/z\.number\(\)\.finite\(\)\.min\(0\)\.multipleOf\(0\.01\)\.nullable\(\)\.optional\(\)/g) ?? []).length).toBe(4);
  });

  it("takes two decimals on a debt balance", () => {
    expect(categories).toContain("debtBalance: z.number().finite().min(0).multipleOf(0.01).nullable().optional(),");
  });

  it("still refuses a negative in either direction", () => {
    // Owing minus five thousand is not a thing; it is being owed five thousand.
    expect(contributors).not.toContain("z.number().finite().multipleOf(0.01).nullable()");
  });
});
