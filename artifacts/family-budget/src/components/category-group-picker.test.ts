import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { resolveGroupChoice } from "./category-group-picker";

const rows = [
  { id: 1, name: "Housing", parentId: null },
  { id: 2, name: "Rent", parentId: 1 },
];

// "Check where else this logic is needed": a budget and a new group wherever a category is added.
describe("putting a new category under a group", () => {
  it("leaves it on its own, or under the group chosen", async () => {
    const create = vi.fn();
    expect(await resolveGroupChoice("none", "", rows, create)).toEqual({ parentId: null });
    expect(await resolveGroupChoice("1", "", rows, create)).toEqual({ parentId: 1 });
    expect(create).not.toHaveBeenCalled();
  });

  it("makes a new group first, or uses a top-level category of that name", async () => {
    const create = vi.fn().mockResolvedValue({ id: 9 });
    expect(await resolveGroupChoice("new", "Children", rows, create)).toEqual({ parentId: 9 });
    expect(create).toHaveBeenCalledWith("Children");
    expect(await resolveGroupChoice("new", " housing ", rows, vi.fn())).toEqual({ parentId: 1 });
  });

  it("refuses a missing name, or a name that is already a subcategory", async () => {
    expect(await resolveGroupChoice("new", "  ", rows, vi.fn())).toHaveProperty("error");
    expect(await resolveGroupChoice("new", "Rent", rows, vi.fn())).toHaveProperty("error");
  });
});

describe("every web form that adds a category offers a budget and a group", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

  it("Bank, money out", () => {
    const page = read("../pages/bank.tsx");
    expect(page).toContain('data-testid="input-new-category-budget"');
    expect(page).toContain('data-testid="button-new-category-parent-new-group"');
  });

  it("Enter a whole day", () => {
    expect(read("../pages/bank-day.tsx")).toContain('<option value="new">+ New group…</option>');
  });

  it("the dashboard's quick add and Expenses", () => {
    expect(read("../pages/dashboard.tsx")).toContain('testId="dashboard-new-category"');
    expect(read("../pages/expenses.tsx")).toContain('testId="expenses-new-category"');
  });

  it("the M-Pesa import, which had no way to add one", () => {
    const page = read("../pages/mpesa-import.tsx");
    expect(page).toContain('{canManageBudget ? <option value={ADD_CATEGORY}>+ Add a category…</option> : null}');
    expect(page).toContain('testId="mpesa-new-category"');
  });
});
