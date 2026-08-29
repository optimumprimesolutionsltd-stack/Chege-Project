import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("./dashboard.tsx", import.meta.url), "utf8");
const expensesSource = readFileSync(new URL("./expenses.tsx", import.meta.url), "utf8");
const mobileSource = readFileSync(
  new URL("../../../mobile-budget/app/add-expense.tsx", import.meta.url),
  "utf8",
);

describe("Other expense category", () => {
  it("offers Other and requires a note in the dashboard quick log", () => {
    expect(dashboardSource).toContain('<option value="Other">Other</option>');
    expect(dashboardSource).toContain('const isOtherCategory = category.trim().toLocaleLowerCase() === "other";');
    expect(dashboardSource).toContain('title: "Note required"');
    expect(dashboardSource).toContain("notes.trim().length < 3");
    expect(dashboardSource).toContain('maxLength={isOtherCategory ? 120 : undefined}');
    expect(dashboardSource).toContain("Save this as a category for future expenses");
    expect(dashboardSource).toContain("category: expenseCategory");
  });

  it("offers Other and requires a note in the full web form", () => {
    expect(expensesSource).toContain('<option value="Other">Other</option>');
    expect(expensesSource).toContain('{form.category.trim().toLocaleLowerCase() === "other" ? "Brief description" : "Description"}');
    expect(expensesSource).toContain('maxLength={form.category.trim().toLocaleLowerCase() === "other" ? 120 : undefined}');
    expect(expensesSource).toContain('title: "Note required"');
    expect(expensesSource).toContain("addForm.notes.trim().length < 3");
    expect(expensesSource).toContain("editForm.notes.trim().length < 3");
    expect(expensesSource).toContain("Save this as a category for future expenses");
    expect(expensesSource).toContain("amount, category: expenseCategory");
  });

  it("offers the same Other-category note path on mobile", () => {
    expect(mobileSource).toContain("...(categories.some((item) => item.name.trim().toLocaleLowerCase() === 'other') ? [] : ['Other'])");
    expect(mobileSource).toContain("category.trim().toLocaleLowerCase() === 'other' && notes.trim().length < 3");
    expect(mobileSource).toContain("Note required");
    expect(mobileSource).toContain("Briefly describe this expense");
    expect(mobileSource).toContain("maxLength={category.trim().toLocaleLowerCase() === 'other' ? 120 : undefined}");
    expect(mobileSource).toContain("Save this as a category for future expenses?");
    expect(mobileSource).toContain("category: expenseCategory");
  });
});