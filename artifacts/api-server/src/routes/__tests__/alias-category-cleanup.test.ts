import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("../../lib/db/migrations/0034_drop_unused_alias_categories.sql", "utf8");
const journal = readFileSync("../../lib/db/migrations/meta/_journal.json", "utf8");
const script = readFileSync("../../scripts/src/fix-staging-categories.ts", "utf8");

// A group holding both "Rent" and "Housing" splits its housing spend across
// two categories that mean the same thing. Renaming the alias cannot fix it:
// budget_categories is unique on (group_id, lower(btrim(name))) and Housing is
// already there, so the rename violates the index and rolls back.
describe("the migration removes an alias only when it is safe to", () => {
  it("deletes rather than renames", () => {
    expect(migration).toContain('DELETE FROM "budget_categories" AS alias');
    expect(migration).not.toContain("SET \"name\" = 'Housing'");
  });

  it("only acts where the canonical name is already in the group", () => {
    // Otherwise a group whose only housing category is called "Rent" would
    // lose it and be left with nothing.
    expect(migration).toContain("lower(btrim(canonical.\"name\")) = 'housing'");
  });

  it("refuses to remove one that anything has been recorded against", () => {
    for (const table of ["expenses", "expense_category_allocations", "joint_account_transactions"]) {
      expect(migration).toContain(`FROM "${table}" AS`);
    }
    expect(migration).toContain('WHERE child."parent_id" = alias."id"');
  });

  it("guards with NOT EXISTS rather than trusting a count", () => {
    expect((migration.match(/AND NOT EXISTS \(/g) ?? []).length).toBe(4);
  });

  it("is registered, and after the migration before it", () => {
    expect(journal).toContain('"tag": "0034_drop_unused_alias_categories"');
    const entries = JSON.parse(journal).entries as Array<{ tag: string; when: number }>;
    const mine = entries.find((entry) => entry.tag === "0034_drop_unused_alias_categories");
    const previous = entries.find((entry) => entry.tag === "0033_clear_parent_budget_amounts");
    // A `when` below the last recorded migration is never executed, never
    // recorded, and still reports "nothing left pending".
    expect(mine!.when).toBeGreaterThan(previous!.when);
  });
});

describe("the script reports instead of renaming", () => {
  it("no longer writes at all", () => {
    expect(script).not.toContain("UPDATE budget_categories SET name");
    expect(script).toContain("This script no longer writes.");
  });

  it("refuses --apply rather than ignoring it", () => {
    // It used to mean "rename them"; silently accepting it would be worse
    // than refusing.
    expect(script).toContain('if (process.argv.includes("--apply"))');
  });

  it("still refuses any database but the one named", () => {
    expect(script).toContain("refusing to use DATABASE_URL");
  });

  it("separates what a migration can do from what a person must", () => {
    expect(script).toContain("migration 0034 removes this");
    expect(script).toContain("needs a decision");
  });

  it("leaves a group whose only housing category is the alias alone", () => {
    expect(script).toContain("this group has no ");
    expect(script).toContain("not a duplicate");
  });
});
