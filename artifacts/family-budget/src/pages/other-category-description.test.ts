import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("./dashboard.tsx", import.meta.url), "utf8");
const expensesSource = readFileSync(new URL("./expenses.tsx", import.meta.url), "utf8");

describe("optional web expense categorization", () => {
  it("starts dashboard quick expenses without a category and confirms an uncategorized save", () => {
    expect(dashboardSource).toContain('useState([{ category: "", amount: "" }])');
    expect(dashboardSource).toContain("Save without a category?");
    expect(dashboardSource).toContain("Save without category");
    expect(dashboardSource).toContain("Create a monthly budget");
    expect(dashboardSource).toContain("const hasCategoryAllocation = allocations.some((allocation) => allocation.category);");
    expect(dashboardSource).toContain('category: hasCategoryAllocation ? expenseCategory : ""');
    expect(dashboardSource).toContain("...(hasCategoryAllocation ? { categoryAllocations:");
    expect(dashboardSource).toContain("openRecurringBudgetSetup(false, description)");
    expect(dashboardSource).toContain('"Uncategorized"');
  });

  it("allows uncategorized add and edit saves while validating deliberate allocations", () => {
    expect(expensesSource).toContain("Save without a category?");
    expect(expensesSource).toContain("Save without category");
    expect(expensesSource).toContain("Create a monthly budget");
    expect(expensesSource).toContain("const hasCategoryAllocation = categoryAllocations.some((allocation) => allocation.category);");
    expect(expensesSource).toContain("if (hasCategoryAllocation && (categoryAllocations.some");
    expect(expensesSource).toContain('category: hasCategoryAllocation ? expenseCategory : ""');
    expect(expensesSource).toContain('category: hasCategoryAllocation ? editForm.category : ""');
    expect(expensesSource).toContain('...(hasCategoryAllocation ? { categoryAllocations');
    expect(expensesSource).toContain('openRecurringBudgetSetup(addForm, "add", false, addForm.description)');
    expect(expensesSource).toContain('"Uncategorized"');
  });

  it("restores the draft with the category created through Budget selected", () => {
    for (const source of [dashboardSource, expensesSource]) {
      expect(source).toContain("(!allocation.category.trim() || allocation.category.trim().toLocaleLowerCase() === \"other\") && draft.confirmedCategory");
      expect(source).toContain("confirmedCategory?: string");
    }
    expect(dashboardSource).toContain('setCategory(draft.confirmedCategory && !draft.category?.trim() ? draft.confirmedCategory : draft.category ?? "")');
  });
});