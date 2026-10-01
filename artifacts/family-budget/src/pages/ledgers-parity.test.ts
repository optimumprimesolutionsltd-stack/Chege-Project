import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { groupByCategory, groupByItem, SPLIT_LABEL } from "@/lib/ledger-groups";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const entry = (id: string, description: string, amount: number, categories: string[]) => ({ id, date: "2026-09-02", description, amount, categories });

// Side-by-side check, batch 2: the phone's All income and All expenses, on the web.
describe("the web files the expense ledger as the phone does", () => {
  it("is the phone's grouping, word for word", () => {
    const phone = readFileSync(new URL("../../../mobile-budget/lib/groupExpenses.ts", import.meta.url), "utf8").replace(/'/g, '"').replace(/\r\n/g, "\n");
    expect(read("../lib/ledger-groups.ts").replace(/\r\n/g, "\n")).toContain(phone.trim());
  });

  it("puts a split expense on its own, and groups items by name", () => {
    const rows = [entry("a", "Milk", 100, ["Food"]), entry("b", " milk ", 50, ["Food"]), entry("c", "Shopping", 300, ["Food", "Home"])];
    expect(groupByCategory(rows).map((group) => [group.label, group.total])).toEqual([[SPLIT_LABEL, 300], ["Food", 150]]);
    expect(groupByItem(rows).find((group) => group.label === "Milk")?.total).toBe(150);
  });
});

describe("All income and All expenses exist on the web", () => {
  it("as pages, routed and in the menu", () => {
    const app = read("../App.tsx");
    expect(app).toContain('<Route path="/expense-ledger" component={ExpenseLedger} />');
    expect(app).toContain('<Route path="/income-ledger" component={IncomeLedger} />');
    const layout = read("../components/layout.tsx");
    expect(layout).toContain("label: 'All expenses'");
    expect(layout).toContain("label: 'All income'");
  });

  it("with a month stepper, a search, the groupings and a PDF", () => {
    const expenses = read("./expense-ledger.tsx");
    expect(expenses).toContain('testId="expense-ledger-month"');
    expect(expenses).toContain('data-testid={`expense-ledger-view-${value}`}');
    expect(expenses).toContain('data-testid="expense-ledger-pdf"');
    const income = read("./income-ledger.tsx");
    expect(income).toContain('testId="income-ledger-month"');
    expect(income).toContain("By income stream");
    expect(income).toContain('data-testid="income-ledger-other"');
  });
});
