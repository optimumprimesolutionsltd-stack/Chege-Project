import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { householdRows } from "../household-breakdown";

const row = (category: string, budgetAmount: number, spentAmount: number, over: Record<string, unknown> = {}) => ({
  category, budgetAmount, spentAmount, remaining: budgetAmount - spentAmount, percentUsed: 0, parentName: null as string | null, isBusinessCost: false, ...over,
});

// Stock showed as household spending, and over budget, on Reports, the PDF and Ask Jamvi.
describe("the household's categories", () => {
  it("leave a side hustle's cost out, and out of the heading it sits under", () => {
    const rows = householdRows([
      row("Shop", 60000, 58000),
      row("Stock", 50000, 52000, { parentName: "Shop", isBusinessCost: true }),
      row("Shop rent", 10000, 6000, { parentName: "Shop" }),
      row("Food", 20000, 23000),
    ]);
    expect(rows.map((r) => r.category)).toEqual(["Shop", "Shop rent", "Food"]);
    expect(rows[0]).toMatchObject({ budgetAmount: 10000, spentAmount: 6000, remaining: 4000, percentUsed: 60 });
  });

  it("take a business heading's sub-categories with it", () => {
    const rows = householdRows([
      row("Kiosk", 0, 900, { isBusinessCost: true }),
      row("Kiosk stock", 0, 900, { parentName: "Kiosk" }),
      row("Rent", 25000, 25000),
    ]);
    expect(rows.map((r) => r.category)).toEqual(["Rent"]);
  });
});

describe("where the household's figures are used", () => {
  const dashboard = readFileSync("src/routes/dashboard.ts", "utf8");
  const tools = readFileSync("src/lib/ask-jamvi-tools.ts", "utf8");
  it("the breakdown gives them on request, and the PDF and Ask Jamvi use them", () => {
    expect(dashboard).toContain('res.json(req.query.scope === "household" ? householdRows(breakdown) : breakdown);');
    expect(dashboard).toContain("const totalBudget = sumBudget(householdCategories);");
    expect(tools).toContain('scope: "household"');
  });

  it("the spending trend counts bank and M-Pesa spending too", () => {
    expect(dashboard).toContain("totalSpent: Math.max(0, Number(spentRow.total) + Number(bankRow?.total ?? 0) - businessCosts),");
  });
});
