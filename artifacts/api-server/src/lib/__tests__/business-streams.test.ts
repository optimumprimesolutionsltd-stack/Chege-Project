import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { businessCostLink, notBusinessSale, setBusinessStreamsReadyForTests } from "../business-streams";
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
    expect((dashboard.match(/incomeStreamCostLines\(groupId, [^)]*\{ personalOnly: true \}\)/g) ?? []).length).toBe(4);
  });

  it("an income stream carries no costs: its income is what came in", () => {
    expect(dashboard).not.toContain("incomeStreamCostsBySource");
    expect(dashboard).toContain("const costsByStream = new Map<number, number>();");
    expect(dashboard).toContain('const contributionTotal = numberValue("contributionTotal");');
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
