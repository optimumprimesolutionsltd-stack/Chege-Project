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

// "Make it more detailed if the user wants, with an option of hiding": the
// entries behind each figure, each cost's share of sales, and last period.
describe("a statement's details", () => {
  const costEntries = Array.from({ length: 30 }, (_, i) => ({
    incomeSourceId: 1, category: "Stock", date: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`, description: `Stock ${i}`, amount: 1000,
  }));
  const report = buildBusinessReport({
    from: "2026-09-01", to: "2026-09-30",
    salesByStream: new Map([[1, 50000]]),
    costLines: [
      { incomeSourceId: 1, category: "Stock", costKind: "cogs", amount: 30000 },
      { incomeSourceId: 1, category: "Transport", costKind: "expense", amount: 5000 },
    ],
    linkedStreamIds: [1],
    streamNames,
    detail: {
      salesEntries: [
        { incomeSourceId: 1, date: "2026-09-03", description: "Sale A", amount: 20000 },
        { incomeSourceId: 1, date: "2026-09-20", description: "Sale B", amount: 30000 },
        { incomeSourceId: 2, date: "2026-09-21", description: "Not this business", amount: 9 },
      ],
      costEntries,
      previous: {
        from: "2026-08-01", to: "2026-08-31",
        salesByStream: new Map([[1, 40000]]),
        costLines: [{ incomeSourceId: 1, category: "Stock", costKind: "cogs", amount: 10000 }],
      },
    },
  });
  const business = report.businesses[0] as Record<string, unknown> & {
    costOfGoodsSoldLines: Array<{ shareOfSales?: number | null; entries?: unknown[]; more?: number }>;
    expenseLines: Array<{ shareOfSales?: number | null }>;
    salesEntries?: Array<{ description: string }>;
    previous?: Record<string, unknown>;
  };

  it("lists this business's sales only, newest first", () => {
    expect(business.salesEntries!.map((entry) => entry.description)).toEqual(["Sale B", "Sale A"]);
  });

  it("gives each cost as a share of sales", () => {
    expect(business.costOfGoodsSoldLines[0].shareOfSales).toBe(60);
    expect(business.expenseLines[0].shareOfSales).toBe(10);
  });

  it("lists up to 25 entries behind a cost, and counts the rest", () => {
    expect(business.costOfGoodsSoldLines[0].entries).toHaveLength(25);
    expect(business.costOfGoodsSoldLines[0].more).toBe(5);
  });

  it("works out last period's statement the same way", () => {
    expect(business.previous).toEqual({
      from: "2026-08-01", to: "2026-08-31",
      sales: 40000, costOfGoodsSold: 10000, grossProfit: 30000, expenses: 0, netProfit: 30000,
    });
  });

  it("carries none of it unless details are asked for", () => {
    const plain = buildBusinessReport({
      from: "2026-09-01", to: "2026-09-30", salesByStream: new Map([[1, 1]]), costLines: [], linkedStreamIds: [1], streamNames,
    }).businesses[0] as Record<string, unknown>;
    expect(plain.salesEntries).toBeUndefined();
    expect(plain.previous).toBeUndefined();
  });
});
