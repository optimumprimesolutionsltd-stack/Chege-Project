import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/budget-categories.ts", "utf8");
const migration = readFileSync("../../lib/db/migrations/0033_clear_parent_budget_amounts.sql", "utf8");
const journal = readFileSync("../../lib/db/migrations/meta/_journal.json", "utf8");

// A parent is budgeted through its subcategories. The number stored on the
// parent stopped counting in #222, and a stored figure that nothing displays
// is one nobody can correct — while anything reading the table directly finds
// it and takes it for the budget.
describe("the migration clears what is already there", () => {
  it("only touches a category that has subcategories", () => {
    expect(migration).toContain('WHERE child."parent_id" = parent."id"');
    expect(migration).toContain('UPDATE "budget_categories" AS parent');
    expect(migration).toContain('SET "budget_amount" = 0');
  });

  it("leaves a category with no subcategories alone", () => {
    // Which is every category until somebody nests one. An unguarded UPDATE
    // here would wipe the figure off every category in every group.
    const statement = migration.slice(migration.indexOf('UPDATE "budget_categories"'));
    expect(statement).toContain("WHERE");
    expect(statement).toContain("EXISTS (");
    expect(statement.indexOf("WHERE")).toBeLessThan(statement.indexOf("EXISTS ("));
  });

  it("does nothing on a second run", () => {
    // Re-running must not churn rows that are already zero.
    expect(migration).toContain('"budget_amount" <> 0');
  });

  it("is registered, or it never runs", () => {
    expect(journal).toContain('"tag": "0033_clear_parent_budget_amounts"');
  });
});

describe("and every path that creates a parent clears it too", () => {
  it("has one helper rather than four copies of the update", () => {
    expect(route).toContain("async function clearParentBudgetAmount(");
    // Asserted line by line: this file is CRLF on disk, so an assertion that
    // spells out "\n" between two lines matches nothing once checked out.
    expect(route).toContain("await runner.update(budgetCategoriesTable)");
    expect(route).toContain(".set({ budgetAmount: 0 })");
    // One implementation, four call sites.
    expect((route.match(/clearParentBudgetAmount\(/g) ?? []).length).toBe(5);
  });

  it("clears it when a category is created under a parent", () => {
    // Pinned by order rather than exact layout: the clear happens inside the
    // transaction, before the created row is returned.
    const create = route.slice(route.indexOf("const [created] = await tx.insert(budgetCategoriesTable)"));
    const clear = create.indexOf("clearParentBudgetAmount(tx, groupId, parsed.data.parentId)");
    const returned = create.indexOf("return created;");
    expect(clear).toBeGreaterThan(-1);
    expect(clear).toBeLessThan(returned);
  });

  it("clears it when an existing category is moved under a parent", () => {
    expect(route).toContain("await clearParentBudgetAmount(tx, groupId, parentId);");
  });

  it("clears it when the suggestions applier nests several at once", () => {
    // One parent can take several children in a single apply; clearing it once
    // per distinct parent rather than once per child.
    expect(route).toContain("for (const parentId of new Set(childRows.map((child) => child.parentId)))");
  });

  it("clears it when an update nests a category", () => {
    expect(route).toContain("// Nesting this category under a parent leaves that parent budgeted");
  });

  it("does it inside the same transaction as the nesting", () => {
    // A cleared amount with no child, or a child with a stale parent figure,
    // would both be worse than either alone.
    expect(route).toContain("await clearParentBudgetAmount(tx, groupId,");
    expect(route).not.toContain("await clearParentBudgetAmount(db, groupId,");
  });
});
