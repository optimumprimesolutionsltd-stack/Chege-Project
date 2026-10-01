import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { amountForMonth, withMonthBudgets, type BudgetMonthRow } from "../budget-months";

vi.mock("@workspace/db", () => ({ db: {} }));

const row = (year: number, month: number, amount: number, onlyThisMonth = false): BudgetMonthRow => ({ categoryId: 1, year, month, amount, onlyThisMonth });

// "Budgets that differ by month, January at one amount and October at another,
// with the budget maintained" - earlier months keep what they had.
describe("a category's budget in a month", () => {
  it("is the budget now when it has never changed", () => {
    expect(amountForMonth([], 100_000, 2026, 1)).toBe(100_000);
  });

  it("keeps the old amount before a change and the new one from it", () => {
    // Rent was 80,000 until October, 100,000 now.
    const rows = [row(2026, 10, 80_000)];
    expect(amountForMonth(rows, 100_000, 2026, 1)).toBe(80_000);
    expect(amountForMonth(rows, 100_000, 2026, 9)).toBe(80_000);
    expect(amountForMonth(rows, 100_000, 2026, 10)).toBe(100_000);
    expect(amountForMonth(rows, 100_000, 2027, 3)).toBe(100_000);
  });

  it("follows several changes, each month taking the first change after it", () => {
    // 60,000 until March, 80,000 until October, 100,000 now.
    const rows = [row(2026, 10, 80_000), row(2026, 3, 60_000)];
    expect(amountForMonth(rows, 100_000, 2026, 2)).toBe(60_000);
    expect(amountForMonth(rows, 100_000, 2026, 3)).toBe(80_000);
    expect(amountForMonth(rows, 100_000, 2026, 11)).toBe(100_000);
  });

  it("uses a one-month budget for that month alone", () => {
    const rows = [row(2026, 12, 150_000, true), row(2026, 10, 80_000)];
    expect(amountForMonth(rows, 100_000, 2026, 12)).toBe(150_000);
    expect(amountForMonth(rows, 100_000, 2026, 11)).toBe(100_000);
    expect(amountForMonth(rows, 100_000, 2027, 1)).toBe(100_000);
    expect(amountForMonth(rows, 100_000, 2026, 9)).toBe(80_000);
  });

  it("rolls across the year", () => {
    expect(amountForMonth([row(2026, 1, 5_000)], 9_000, 2025, 12)).toBe(5_000);
  });
});

describe("applying a month's budgets to loaded categories", () => {
  it("changes only categories with history, leaving the rest", () => {
    const loaded = [{ id: 1, budgetAmount: 100_000 }, { id: 2, budgetAmount: 30_000 }];
    const history = new Map([[1, [row(2026, 10, 80_000)]]]);
    expect(withMonthBudgets(loaded, history, 2026, 1)).toEqual([{ id: 1, budgetAmount: 80_000 }, { id: 2, budgetAmount: 30_000 }]);
    expect(withMonthBudgets(loaded, new Map(), 2026, 1)).toEqual(loaded);
  });
});

describe("every month view uses the month's budget", () => {
  const dashboard = readFileSync("src/routes/dashboard.ts", "utf8");
  const digest = readFileSync("src/lib/digest.ts", "utf8");
  const ai = readFileSync("src/routes/ai.ts", "utf8");

  it("Home, the budget plan, and the report", () => {
    expect(dashboard.match(/monthBudgets\(groupId/g)?.length).toBe(3);
  });

  it("the monthly digest and Ask Jamvi", () => {
    expect(digest).toContain("const monthHistory = await budgetHistoryFor(groupId, year, month);");
    expect(digest).toContain("withMonthBudgets(categories, monthHistory, year, month)");
    expect(ai).toContain(".then((rows) => monthBudgets(groupId, rows, year, month)),");
  });
});

describe("changing a budget keeps earlier months", () => {
  const route = readFileSync("src/routes/budget-categories.ts", "utf8");
  const put = route.slice(route.indexOf('router.put("/budget-categories/:id"'));

  it("records what earlier months had before any change to a recurring budget, from this month unless told", () => {
    expect(put).toContain("const keepsEarlier = parsed.data.budgetAmount !== undefined && parsed.data.budgetAmount !== existing.budgetAmount && existing.isRecurring;");
    expect(put).toContain("from: reach.data.budgetFrom ?? nairobiMonth()");
  });

  it("can set one month alone, without touching the budget now", () => {
    expect(put).toContain("await setOnlyThisMonth({ groupId, categoryId: id, year: onlyMonth.year, month: onlyMonth.month, amount: parsed.data.budgetAmount });");
    expect(put).toContain("delete parsed.data.budgetAmount;");
  });

  it("creates its table after the server starts", () => {
    expect(readFileSync("src/index.ts", "utf8")).toContain("void ensureBudgetMonths();");
  });
});
