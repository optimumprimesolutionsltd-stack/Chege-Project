import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bankRoute = readFileSync("src/routes/joint-account.ts", "utf8");
const expenseRoute = readFileSync("src/routes/expenses.ts", "utf8");
const spec = readFileSync("../../lib/api-spec/openapi.yaml", "utf8");
const mobileBank = readFileSync("../mobile-budget/app/(tabs)/bank.tsx", "utf8");
const mobileExpense = readFileSync("../mobile-budget/app/add-expense.tsx", "utf8");
const webBank = readFileSync("../family-budget/src/pages/bank.tsx", "utf8");
const webExpenses = readFileSync("../family-budget/src/pages/expenses.tsx", "utf8");
const webDashboard = readFileSync("../family-budget/src/pages/dashboard.tsx", "utf8");

// Editing a posting down to nothing had to be done by deleting it. A line that
// turned out to be reversed is still a line that happened, and deleting the
// row loses the reconciliation along with it.
describe("an amount may be zero", () => {
  it("has one schema for bank amounts, and it is not positive-only", () => {
    expect(bankRoute).toContain("const NonNegativeBankAmount = z.number().finite().nonnegative().multipleOf(0.01);");
    // Left behind, it would have been the obvious thing to reach for next.
    expect(bankRoute).not.toContain("const PositiveBankAmount");
    expect(bankRoute).not.toContain("amount: PositiveBankAmount");
  });

  it("keeps ids positive, which is a different question", () => {
    expect(bankRoute).toContain("accountId: z.number().int().positive().optional(),");
    expect(bankRoute).toContain("const IdParam = z.object({ id: z.coerce.number().int().positive() });");
  });

  it("lets a savings transfer be zero, in whole shillings", () => {
    expect(bankRoute).toContain("amount: z.number().int().nonnegative(),");
  });

  it("lets an expense portion and a category allocation be zero", () => {
    expect(expenseRoute).toContain("amount: z.number().int().nonnegative(),");
    expect(expenseRoute).not.toContain("amount: z.number().int().positive(),");
  });

  it("says so in the spec rather than only in the server", () => {
    // The clients validate from the generated schema, so a spec still saying
    // minimum 0.01 would reject zero before the request left the phone.
    expect(spec).not.toContain("minimum: 0.01");
    expect(spec).toContain("Zero is allowed, so an existing posting can be cleared to nothing rather than deleted.");
  });

  it("leaves contributions, debt cascades and goal top-ups alone", () => {
    // Those were not asked for, and each has its own meaning for zero.
    for (const schema of ["ContributionInput", "CascadeContributeInput", "SavingsGoalContributeInput"]) {
      const at = spec.indexOf(`    ${schema}:`);
      expect(at).toBeGreaterThan(-1);
      expect(spec.slice(at, at + 220)).toContain("minimum: 1");
    }
  });
});

describe("clearing the field on an edit means zero", () => {
  it("reads an empty amount as zero only when editing", () => {
    // Saving a blank new form silently as zero would be a way to create rows
    // by accident.
    expect(mobileBank).toContain("const parsed = amount.trim() === '' && editingTransactionId !== null ? 0 : readAmount(amount);");
    // readAmount rather than parseBankAmount since the web field gained
    // arithmetic: it resolves a sum, or reads a plain number as itself.
    expect(webBank).toContain('const total = amount.trim() === "" && editingTransaction ? 0 : readAmount(amount);');
  });

  it("no longer deletes the expense when its amount is cleared", () => {
    // That made "I got the figure wrong" and "this never happened" the same
    // gesture, and only one of them is recoverable.
    expect(mobileExpense).toContain("if (isEditMode && !amount.trim()) setAmount('0');");
    expect(mobileExpense).not.toContain("if (isEditMode && !amount.trim()) {");
  });

  it("keeps a way to delete on purpose", () => {
    expect(mobileExpense).toContain("{isEditMode && canRemoveExpense ? (");
    expect(mobileExpense).toContain("onPress={handleRemove}");
  });

  it("stops refusing zero on every form", () => {
    expect(mobileBank).toContain("if (parsed === null || parsed < 0) {");
    expect(webBank).toContain("if (total === null || total < 0) {");
    expect(webExpenses).toContain("if (!Number.isFinite(amount) || amount < 0) {");
    // Recurring monthly budgets and goal top-ups keep their own rule, so the
    // phrase survives elsewhere; these are the four that were asked about.
    expect(webBank).not.toContain("amount greater than zero");
    expect(webExpenses).not.toContain("Use an expense amount greater than zero");
    expect(webDashboard).not.toContain("Add a deposit amount greater than zero");
    expect(webDashboard).not.toContain("Add an expense amount greater than zero");
  });

  it("stops the browser blocking anything under a shilling", () => {
    // min="1" sat beside step="0.01", which contradicted itself: it refused
    // 0.50 as firmly as it refused 0.
    expect(webBank).not.toContain('min="1"');
  });

  it("tells a typed zero apart from a blank field", () => {
    // "!amt" is true for both, so a quick deposit of 0 was reported as a
    // missing amount. The goal top-up keeps the old guard on purpose: its
    // minimum was not in scope, and zero there means nothing was added.
    expect((webDashboard.match(/if \(!amt \|\| amt <= 0\) \{/g) ?? []).length).toBe(1);
    expect((webDashboard.match(/if \(!amount\.trim\(\) \|\| !Number\.isFinite\(amt\) \|\| amt < 0\) \{/g) ?? []).length).toBe(2);
  });
});
