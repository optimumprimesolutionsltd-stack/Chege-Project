import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("../../lib/db/src/schema/budget.ts", "utf8");
const migration = readFileSync("../../lib/db/migrations/0042_lending_is_not_spending.sql", "utf8");
const journal = readFileSync("../../lib/db/migrations/meta/_journal.json", "utf8");
const bank = readFileSync("src/routes/joint-account.ts", "utf8");
const dashboard = readFileSync("src/routes/dashboard.ts", "utf8");

// The mirror of 0040. Money lent leaves the account like any withdrawal, but
// you have not spent it: you expect it back, and it is now owed to you.
// Counted as spending, every month somebody helps a relative reads as a month
// they overspent.
describe("a withdrawal can say it was lent", () => {
  it("is recorded on the transaction", () => {
    expect(schema).toContain('isLending: boolean("is_lending").notNull().default(false)');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "is_lending" boolean NOT NULL DEFAULT false');
  });

  it("invents nothing for what is already recorded", () => {
    expect(migration).not.toContain("UPDATE");
  });

  it("is registered after the migration before it", () => {
    const entries = JSON.parse(journal).entries as Array<{ tag: string; when: number }>;
    const mine = entries.find((entry) => entry.tag === "0042_lending_is_not_spending");
    const previous = entries.find((entry) => entry.tag === "0041_debts_take_cents");
    expect(mine!.when).toBeGreaterThan(previous!.when);
  });
});

// Unlike borrowing, no figure had to learn anything. Every spending total
// already filters on a category being present, and a loan has none because it
// is not a cost.
describe("it stays out of spending without a new filter anywhere", () => {
  it("carries no category", () => {
    expect(bank).toContain('const expenseCategory = isLending ? null : canonicalExpenseCategoryName(parsed.data.expenseCategory ?? "");');
  });

  it("relies on the filter every spending total already has", () => {
    expect(dashboard).toContain("expense_category IS NOT NULL");
    expect((dashboard.match(/expenseCategory\} IS NOT NULL/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("is still money out of the account, which it really was", () => {
    // The disbursement total takes every withdrawal, category or not. Only the
    // standalone total — spending — filters on one.
    expect(dashboard).toContain("AS bank_disbursement_total");
    expect(dashboard).toContain("AS standalone_disbursement_total");
  });
});

describe("a missing category is allowed only because it was lent", () => {
  it("is refused on any other withdrawal", () => {
    // Left to the schema alone, any withdrawal could quietly lose its category
    // and drop out of spending.
    expect(bank).toContain("if (!value.isLending && !value.expenseCategory) {");
    expect(bank).toContain('message: "Choose a valid budget category."');
  });

  it("insists on saying who it went to", () => {
    expect(bank).toContain('res.status(400).json({ error: "Say who the money was lent to." });');
  });

  it("skips the heading check it has nothing to check", () => {
    expect(bank).toContain("const disbursementHeading = expenseCategory === null ? null : await headingAmong(groupId, [expenseCategory]);");
  });

  it("skips the category lookup rather than failing it", () => {
    expect(bank).toContain("if (expenseCategory !== null) {");
  });

  it("still gives the row something to be called", () => {
    expect(bank).toContain('description: description || expenseCategory || "Lent out",');
  });
});

// The create path knew a loan out has no category. The update path did not:
// it required one for every disbursement, falling back to the row's own —
// which is null for a loan — so editing one was refused with "Choose a valid
// budget category" and there was no category that would have satisfied it.
describe("editing a loan out is not refused for having no category", () => {
  it("does not demand one when the row is a loan", () => {
    expect(bank).toContain("const editingALoanOut = existing.isLending === true;");
    expect(bank).toContain("if (!editingALoanOut && !expenseCategory) {");
  });

  it("takes the row as the authority, not the request", () => {
    // An edit must not turn ordinary spending into a loan, or the reverse, by
    // omitting a field.
    expect(bank).not.toContain("parsed.data.isLending === true");
  });

  it("skips the lookup and the heading check it has nothing to check", () => {
    expect(bank).toContain("const editHeading = expenseCategory === null ? null : await headingAmong(groupId, [expenseCategory]);");
  });

  it("keeps the narration rather than replacing it with nothing", () => {
    expect(bank).toContain(": parsed.data.description || expenseCategory || existing.description;");
  });

  it("still demands a category for an ordinary withdrawal", () => {
    expect((bank.match(/Choose a valid budget category\./g) ?? []).length).toBe(4);
  });
});
