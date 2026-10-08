import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { notBusinessCost, notBusinessSale, setBusinessStreamsReadyForTests } from "../business-streams";
import { notAReversal } from "../reversal-links";

const chunks = (fragment: unknown) => JSON.stringify((fragment as { queryChunks: unknown[] }).queryChunks);
const dashboard = readFileSync("src/routes/dashboard.ts", "utf8");
const ai = readFileSync("src/routes/ai.ts", "utf8");
const index = readFileSync("src/index.ts", "utf8");

afterEach(() => setBusinessStreamsReadyForTests(false));

// "Right now income streams appear under businesses ... add a section I can
// create business name" (8 Oct 2026).
describe("businesses named by the person", () => {
  it("change nothing until the table exists, made after the server listens", () => {
    expect(chunks(notBusinessCost(1, sql`c`))).not.toContain("business_streams");
    expect(chunks(notBusinessSale(sql`t.id`))).not.toContain("business_streams");
    expect(index.indexOf("void ensureBusinessStreams();")).toBeGreaterThan(index.indexOf("app.listen("));
  });

  it("a business's sales leave every personal income figure", () => {
    setBusinessStreamsReadyForTests(true);
    expect(chunks(notAReversal(sql`t.id`))).toContain("JOIN business_streams bs ON bs.income_source_id = st.income_source_id");
  });

  it("its costs leave every personal spending figure, Ask Jamvi included", () => {
    expect((dashboard.match(/\$\{notBusinessCost\(groupId, /g) ?? []).length).toBe(8);
    expect(dashboard).toContain("AND NOT (bank_tx.type = 'disbursement' AND ${isBusinessCost(groupId, sql`bank_tx.expense_category`)})");
    expect(ai).toContain("${notBusinessCost(groupId, jointAccountTxTable.expenseCategory)}");
  });

  it("the Business report shows only the named businesses once there are any", () => {
    expect(dashboard).toContain("linkedStreamIds: named.length === 0 ? linkedStreamIds : named,");
    expect(dashboard).toContain("costLines: onlyNamed(costLines),");
  });
});
