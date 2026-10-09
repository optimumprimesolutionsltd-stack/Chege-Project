import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { businessCostLink, isBusinessSale, notBusinessSale, setBusinessStreamsReadyForTests } from "../business-streams";
import { notAReversal } from "../reversal-links";

const chunks = (fragment: unknown) => JSON.stringify((fragment as { queryChunks: unknown[] }).queryChunks);
const dashboard = readFileSync("src/routes/dashboard.ts", "utf8");
const index = readFileSync("src/index.ts", "utf8");

afterEach(() => setBusinessStreamsReadyForTests(false));

// "Right now income streams appear under businesses ... add a section I can
// create business name" (8 Oct 2026).
describe("businesses named by the person", () => {
  it("change nothing until the table exists, made after the server listens", () => {
    expect(chunks(businessCostLink(1, sql`c`))).not.toContain("business_streams");
    expect(chunks(notBusinessSale(sql`t.id`))).not.toContain("business_streams");
    expect(index.indexOf("void ensureBusinessStreams();")).toBeGreaterThan(index.indexOf("app.listen("));
  });

  it("a business's sales leave every personal income figure", () => {
    setBusinessStreamsReadyForTests(true);
    expect(chunks(notAReversal(sql`t.id`))).toContain("JOIN business_streams bs ON bs.income_source_id = st.income_source_id");
  });

  // "remove logic of income streams as businesses to avoid confusion" (8 Oct 2026).
  it("only a business's costs are business costs: a link to an income stream is ordinary spending", () => {
    setBusinessStreamsReadyForTests(true);
    expect(chunks(businessCostLink(1, sql`c`))).toContain("business_streams");
    expect(dashboard).not.toMatch(/reduces_income_source_id IS NOT NULL/);
    expect(dashboard).not.toContain("reducesIncomeSourceId} IS NOT NULL");
  });

  it("its costs come off personal spending once - never a second time at the source", () => {
    expect(dashboard).not.toContain("notBusinessCost");
    expect(dashboard).not.toContain("isBusinessCost(groupId");
    // Home, Trends, Reports' totals and the PDF - and ownerIncomeCosts, which takes
    // the same costs off the income of a business its owner lives on.
    expect((dashboard.match(/incomeStreamCostLines\(groupId, [^)]*\{ personalOnly: true \}\)/g) ?? []).length).toBe(5);
  });

  it("an income stream carries no costs: its income is what came in - unless it is a business its owner lives on", () => {
    expect(dashboard).not.toContain("incomeStreamCostsBySource");
    expect(dashboard).toContain("const costsByStream = personal && !search ? await ownerIncomeCosts(groupId, from, to) : new Map<number, number>();");
    expect(dashboard).toContain('const contributionTotal = numberValue("contributionTotal") - totalCosts(await ownerIncomeCosts(groupId, start.raw, end.raw));');
  });

  it("the Business report is My businesses, costs or not", () => {
    expect(dashboard).not.toContain("linkedCostStreamIds");
    expect(dashboard).not.toContain("onlyNamed");
    expect(dashboard).toContain("includeBusiness ? loadIncomeLedger(groupId, rangeFrom, rangeTo, null, { personal: false })");
  });
});

describe("count its profit, or its money only passes through", () => {
  const streams = readFileSync("src/lib/business-streams.ts", "utf8");
  const sources = readFileSync("src/routes/income-sources.ts", "utf8");

  it("is kept on each business, on by default", () => {
    expect(streams).toContain('ADD COLUMN IF NOT EXISTS "counts_profit" boolean NOT NULL DEFAULT true');
  });

  it("only a business whose profit counts has a Business report", () => {
    expect(dashboard).toContain("profitBusinessIds(groupId),");
    expect(dashboard).toContain("includeBusiness ? profitBusinessIds(groupId) : Promise.resolve(null),");
  });

  it("income streams can be listed without businesses, and Reports' income streams never include one", () => {
    expect(sources).toContain('req.query.streams === "only"');
    expect(dashboard).toContain("return rows.filter((row) => !businesses.has(row.id));");
  });
});

// "Do you pay yourself a salary from it?" asked once per business (Teach Jamvi,
// My businesses). No salary: "if a business's profit is tracked, its profit
// counts as an income stream" (9 Oct 2026) - one profit line, sales less costs,
// its costs still out of household spending.
describe("a business its owner lives on: its profit is their income", () => {
  const streams = readFileSync("src/lib/business-streams.ts", "utf8");
  const businesses = readFileSync("src/routes/businesses.ts", "utf8");
  const ai = readFileSync("src/routes/ai.ts", "utf8");

  it("keeps the answer on each business, not asked until it is", () => {
    expect(streams).toContain('ADD COLUMN IF NOT EXISTS "pays_salary" boolean`');
    expect(streams).toContain('bs.pays_salary AS "paysSalary"');
    expect(businesses).toContain("paysSalary: z.boolean().nullable().optional()");
  });

  it("setting one answer keeps the other", () => {
    expect(streams).toContain('...(paysSalary === undefined ? [] : [sql`"pays_salary" = ${paysSalary}`]),');
    expect(streams).toContain('...(countsProfit === undefined ? [] : [sql`"counts_profit" = ${countsProfit}`]),');
  });

  it("its sales stay in personal income; every other business's sales stay out", () => {
    setBusinessStreamsReadyForTests(true);
    expect(chunks(isBusinessSale(sql`t.income_source_id`))).toContain("bs.counts_profit AND bs.pays_salary IS FALSE");
    expect(chunks(notBusinessSale(sql`t.id`))).toContain("bs.counts_profit AND bs.pays_salary IS FALSE");
  });

  it("its costs come off that income in every income figure, never twice", () => {
    expect(dashboard).toContain("export async function ownerIncomeCosts(groupId: number, from: string, to: string)");
    // All income, Income streams, the trend, period totals, the PDF and Ask Jamvi.
    expect(dashboard).toContain("const costsByIncomeSourceId = await ownerIncomeCosts(");
    expect(dashboard).toContain("rows.push({ incomeSourceId, sourceName: names.get(incomeSourceId) ?? \"Business\", year, month, amount: -amount });");
    expect(dashboard).toContain("const pdfOwnerCosts = await ownerIncomeCosts(groupId, rangeFrom, rangeTo);");
    expect(ai).toContain("const income = Number(incomeRow[0]?.total ?? 0) - totalCosts(ownerCostsMonth);");
    expect(ai).toContain("incomeReceived: Number(allTimeIncomeTotal[0]?.total ?? 0) - totalCosts(ownerCostsAll),");
  });

  it("only with its profit counted and no salary drawn", () => {
    expect(streams).toContain("business.countsProfit && business.paysSalary === false");
  });
});
