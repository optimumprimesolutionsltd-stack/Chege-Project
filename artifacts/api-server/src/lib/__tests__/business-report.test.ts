import { describe, expect, it } from "vitest";
import { buildBusinessReport, type BusinessCostRow } from "../business-report";

const streamNames = new Map([
  [1, "Generator income"],
  [2, "Freelance work"],
  [3, "Salary"],
]);

function build(sales: [number, number][], costLines: BusinessCostRow[], linkedStreamIds: number[]) {
  return buildBusinessReport({ from: "2026-09-01", to: "2026-09-30", salesByStream: new Map(sales), costLines, linkedStreamIds, streamNames });
}

describe("a business's profit and loss", () => {
  const report = build(
    [[1, 138200], [2, 164622], [3, 90000]],
    [
      { incomeSourceId: 1, category: "Generator fuel", costKind: "cogs", amount: 52000 },
      { incomeSourceId: 1, category: "Generator repairs", costKind: "expense", amount: 12000 },
      { incomeSourceId: 1, category: "Transport", costKind: "expense", amount: 6500 },
      { incomeSourceId: 2, category: "Software", costKind: "expense", amount: 4000 },
    ],
    [1, 2],
  );

  it("takes cost of goods sold off sales for gross profit, then expenses for net profit", () => {
    expect(report.businesses.find((b) => b.incomeSourceId === 1)).toMatchObject({
      name: "Generator income",
      sales: 138200,
      costOfGoodsSold: 52000,
      grossProfit: 86200,
      expenses: 18500,
      netProfit: 67700,
    });
  });

  it("lists each cost by category, biggest first", () => {
    const generator = report.businesses.find((b) => b.incomeSourceId === 1)!;
    expect(generator.costOfGoodsSoldLines).toEqual([{ category: "Generator fuel", amount: 52000 }]);
    expect(generator.expenseLines).toEqual([
      { category: "Generator repairs", amount: 12000 },
      { category: "Transport", amount: 6500 },
    ]);
  });

  it("covers only streams with a cost linked - a salary is not a business", () => {
    expect(report.businesses.map((b) => b.name)).toEqual(["Freelance work", "Generator income"]);
  });

  it("adds the businesses up", () => {
    expect(report.totals).toEqual({ sales: 302822, costOfGoodsSold: 52000, grossProfit: 250822, expenses: 22500, netProfit: 228322 });
  });
});

describe("the edges", () => {
  it("still shows a business in a month it sold nothing, as a loss", () => {
    const report = build([], [{ incomeSourceId: 1, category: "Generator fuel", costKind: "cogs", amount: 3000 }], [1]);
    expect(report.businesses[0]).toMatchObject({ sales: 0, grossProfit: -3000, netProfit: -3000 });
  });

  it("still shows a linked business in a month with no costs, at its sales", () => {
    const report = build([[2, 20000]], [], [2]);
    expect(report.businesses[0]).toMatchObject({ name: "Freelance work", sales: 20000, costOfGoodsSold: 0, netProfit: 20000 });
  });

  it("leaves out a stream that is not the group's", () => {
    const report = build([], [{ incomeSourceId: 99, category: "Stock", costKind: "cogs", amount: 500 }], [99]);
    expect(report.businesses).toEqual([]);
  });

  it("is empty for a budget with no side hustle", () => {
    expect(build([[3, 90000]], [], []).businesses).toEqual([]);
  });
});
