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
    expect(dashboardSource).toContain('value={isOtherCategory ? "" : category}');
    expect(dashboardSource).toContain('aria-pressed={isOtherCategory}');
    expect(dashboardSource).toContain('aria-selected={isOtherCategory}');
    expect(dashboardSource).not.toContain('<option value="Other">Other</option>');
    expect(dashboardSource).not.toContain('<option value="Other" hidden>');
    expect(dashboardSource).toContain('const isOtherCategory = categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === "other");');
    expect(dashboardSource).toContain('title: "Note required"');
    expect(dashboardSource).toContain("notes.trim().length < 3");
    expect(dashboardSource).toContain('data-testid="other-brief-description"');
    expect(dashboardSource).toContain('data-testid="other-expense-notes"');
    expect(dashboardSource).toContain('maxLength={120}');
    expect(dashboardSource).toContain("Save as a category if this repeats");
    expect(dashboardSource).toContain("category: expenseCategory");
  });

  it("offers Other and requires a note in the full web form", () => {
    expect(expensesSource).toContain('value={form.category.trim().toLocaleLowerCase() === "other" ? "" : form.category}');
    expect(expensesSource).toContain('aria-pressed={form.category.trim().toLocaleLowerCase() === "other"}');
    expect(expensesSource).toContain('aria-selected={form.category.trim().toLocaleLowerCase() === "other"}');
    expect(expensesSource).not.toContain('<option value="Other">Other</option>');
    expect(expensesSource).not.toContain('<option value="Other" hidden>');
    expect(expensesSource).toContain('form.categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === "other")');
    expect(expensesSource).toContain('data-testid="other-brief-description"');
    expect(expensesSource).toContain('data-testid="other-expense-notes"');
    expect(expensesSource).toContain('!form.categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === "other")');
    expect(expensesSource).toContain('title: "Note required"');
    expect(expensesSource).toContain("addForm.notes.trim().length < 3");
    expect(expensesSource).toContain("editForm.notes.trim().length < 3");
    expect(expensesSource).toContain("Save as a category if this repeats");
    expect(expensesSource).toContain("amount, category: expenseCategory");
    expect(expensesSource).toContain("Category allocations don't add up");
    expect(expensesSource).toContain("Recurring split expenses are not supported");
    expect(expensesSource).toContain("categoryAllocations");
  });

  it("supports exact split allocations from the dashboard quick log", () => {
    expect(dashboardSource).toContain('data-testid="add-category-allocation-dashboard"');
    expect(dashboardSource).toContain('data-testid="category-allocation-total-dashboard"');
    expect(dashboardSource).toContain("Category allocations don't add up");
    expect(dashboardSource).toContain("Recurring split expenses are not supported");
    expect(dashboardSource).toContain("categoryAllocations:");
  });

  it("places Other details before allocations and excludes category creation", () => {
    expect(dashboardSource.indexOf('id="dashboard-other-expense-panel"'))
      .toBeLessThan(dashboardSource.indexOf('data-testid="add-category-allocation-dashboard"'));
    expect(dashboardSource).toContain(
      "{canManageCategories && !isOtherCategory && isAddingCategory && (",
    );
    expect(dashboardSource).toContain("{canManageCategories && !isOtherCategory && (");

    expect(expensesSource.indexOf('id={`other-expense-panel-${mode}`}'))
      .toBeLessThan(expensesSource.indexOf('data-testid={`add-category-allocation-${mode}`}'));
    expect(expensesSource).toContain(
      "{!form.categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === \"other\") && isCreatingCategory && (",
    );
    expect(dashboardSource).toContain(
      "{!(isOtherCategory && categoryAllocations.length === 1) && (",
    );
    expect(expensesSource).toContain(
      "{!(form.categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === \"other\") && form.categoryAllocations.length === 1) && (",
    );
  });

  it("normalizes only Other allocations, retaining a primary Food allocation", () => {
    for (const source of [expensesSource, dashboardSource]) {
      expect(source).toContain('allocation.category.toLocaleLowerCase() === "other"');
      expect(source).toContain('? { ...allocation, category: normalizedOtherCategory ?? allocation.category }');
      expect(source).toContain(': allocation,');
      expect(source).toContain('let expenseCategory =');
    }
  });

  it("offers the same Other-category note path on mobile", () => {
    expect(mobileSource).toContain("name.trim().toLocaleLowerCase() !== 'other'");
    expect(mobileSource).toContain("chooseCategory('Other')");
    expect(mobileSource).toContain("categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === 'other')");
    expect(mobileSource).toContain("const hasOtherAllocation = hasOtherCategoryAllocation(normalizedAllocations)");
    expect(mobileSource).toContain("hasOtherAllocation && notes.trim().length < 3");
    expect(mobileSource).toContain("Note required");
    expect(mobileSource).toContain("Briefly describe this expense");
    expect(mobileSource).toContain("accessibilityLabel=\"Brief description for Other expense\"");
    expect(mobileSource).toContain("testID=\"other-expense-notes\"");
    expect(mobileSource).toContain("{!categoryAllocations.some((allocation) => allocation.category.trim().toLocaleLowerCase() === 'other') && (");
    expect(mobileSource).toContain("Save as a category if this repeats?");
    expect(mobileSource).toContain("category: expenseCategory");
  });
});