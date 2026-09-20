import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shared = readFileSync("src/lib/category-headings.ts", "utf8");
const expenses = readFileSync("src/routes/expenses.ts", "utf8");
const bank = readFileSync("src/routes/joint-account.ts", "utf8");

// Spending reaches the same category totals through two doors: an expense, and
// a bank disbursement carrying a category. The heading rule was enforced on the
// expense route alone, so banking was a way straight around it — and banking is
// the door M-Pesa parsing will eventually feed.
describe("both doors refuse a heading", () => {
  it("states the rule once, in a module of its own", () => {
    expect(shared).toContain("export async function headingAmong(");
    expect(shared).toContain("export function postingToHeadingError(");
  });

  it("keeps no second copy beside either route", () => {
    for (const source of [expenses, bank]) {
      expect(source).toContain('from "../lib/category-headings"');
      expect(source).not.toContain("async function parentCategoryNames(");
    }
  });

  it("refuses a bank disbursement aimed at a heading", () => {
    expect(bank).toContain("const disbursementHeading = await headingAmong(groupId, [expenseCategory]);");
    expect(bank).toContain("res.status(400).json({ error: postingToHeadingError(disbursementHeading) });");
  });

  it("refuses one edited onto a heading afterwards", () => {
    // Otherwise editing is a second way in, undoing the check the create path
    // just gained.
    expect(bank).toContain("const editHeading = await headingAmong(groupId, [expenseCategory]);");
    expect(bank).toContain("res.status(400).json({ error: postingToHeadingError(editHeading) });");
  });

  it("still refuses an expense, whole or split", () => {
    expect(expenses).toContain("await headingFor([storageCategory])");
    expect(expenses).toContain("await headingFor([resolvedCategory, ...allocations.map((allocation) => allocation.category)])");
  });
});

describe("the lookup itself", () => {
  it("only counts a category that actually holds subcategories", () => {
    expect(shared).toContain("WHERE child.parent_id = ${budgetCategoriesTable.id}");
    expect(shared).toContain("AND child.group_id = ${groupId}");
  });

  it("matches on the normalized name, and reports the real spelling", () => {
    // Both doors reference a category by name rather than by id, and the
    // message should name it the way the person wrote it.
    expect(shared).toContain("normalizeExpenseCategoryName(row.name), row.name");
  });

  it("returns nothing rather than querying when no name was given", () => {
    expect(shared).toContain("if (wanted.length === 0) return null;");
  });

  it("leaves the internal sentinel alone", () => {
    // It is not a real category and can never be a heading.
    expect(expenses).toContain("allowInternalSentinel ? Promise.resolve(null) : headingAmong(groupId, names)");
  });
});
