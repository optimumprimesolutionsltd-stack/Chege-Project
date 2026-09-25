import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { groupExpensesByCategory, groupExpensesByItem } from "./expense-groups";

const expense = (
  id: number,
  description: string,
  amount: number,
  category: string,
  categoryAllocations?: { category: string; amount: number }[],
) => ({ id, description, amount, category, categoryAllocations });

const list = [
  expense(1, "Milk", 120, "Groceries"),
  expense(2, " milk ", 130, "Groceries"),
  expense(3, "Matatu", 200, "Transport"),
  expense(4, "Shopping", 900, "Groceries", [
    { category: "Groceries", amount: 600 },
    { category: "Household", amount: 300 },
  ]),
  expense(5, "Mystery", 10, ""),
];

// "In all expenses page, group the expenses by item and by category" — the web.
describe("groupExpensesByCategory", () => {
  it("gives each split portion to its own category, so totals are exact", () => {
    const groups = groupExpensesByCategory(list);
    const byLabel = Object.fromEntries(groups.map((g) => [g.label, g]));
    expect(byLabel["Groceries"].total).toBe(120 + 130 + 600);
    expect(byLabel["Household"].total).toBe(300);
    expect(byLabel["Transport"].total).toBe(200);
    expect(byLabel["Uncategorized"].total).toBe(10);
  });

  it("lists a split expense under every category it touches", () => {
    const groups = groupExpensesByCategory(list);
    expect(groups.find((g) => g.label === "Groceries")?.rows.map((r) => r.id)).toContain(4);
    expect(groups.find((g) => g.label === "Household")?.rows.map((r) => r.id)).toEqual([4]);
  });

  it("adds up to the money spent", () => {
    const sum = groupExpensesByCategory(list).reduce((total, g) => total + g.total, 0);
    expect(sum).toBe(list.reduce((total, e) => total + e.amount, 0));
  });

  it("orders biggest first", () => {
    const totals = groupExpensesByCategory(list).map((g) => g.total);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
  });
});

describe("groupExpensesByItem", () => {
  it("treats spellings of one thing as one item", () => {
    const milk = groupExpensesByItem(list).find((g) => g.label === "Milk");
    expect(milk).toMatchObject({ total: 250, count: 2 });
  });

  it("adds up to the money spent", () => {
    const sum = groupExpensesByItem(list).reduce((total, g) => total + g.total, 0);
    expect(sum).toBe(list.reduce((total, e) => total + e.amount, 0));
  });
});

describe("the Expenses page offers the three views", () => {
  const page = readFileSync(fileURLToPath(new URL("../pages/expenses.tsx", import.meta.url)), "utf8").replace(/\r\n/g, "\n");
  it("has the switch and files rows into expandable groups", () => {
    expect(page).toContain('data-testid="expense-ledger-views"');
    expect(page).toContain('[["date", "By date"], ["category", "By category"], ["item", "By item"]]');
    expect(page).toContain("groupExpensesByCategory(visibleExpenses)");
    expect(page).toContain("group.rows.map(renderRow)");
  });
});
