import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildBusinessReport } from "../business-report";

const dashboard = readFileSync(join(__dirname, "..", "..", "routes", "dashboard.ts"), "utf8");

// "where did the loss come from, can i edit incase there were wrong entries" (17 Oct 2026).
describe("the entries behind a business's costs", () => {
  it("are sent with All income, the same personal-only costs as its total", () => {
    expect(dashboard).toContain("(await incomeStreamCostEntries(groupId, from, to, { personalOnly: true })).filter((row) => costsByStream.has(row.incomeSourceId))");
    expect(dashboard).toContain("}), costEntries };");
  });

  it("carry what opens each one", () => {
    expect(dashboard).toContain("expense.id AS id, 'expense' AS source");
    expect(dashboard).toContain(`tx.id AS id, 'bank' AS source, tx.account_id AS "accountId"`);
    expect(dashboard).toContain('id: entry.transactionId, source: "bank" as const');
  });

  it("keep them on the Business report's details", () => {
    const report = buildBusinessReport({
      from: "2026-09-01",
      to: "2026-09-30",
      salesByStream: new Map([[7, 15612]]),
      costLines: [{ incomeSourceId: 7, category: "Stock", costKind: "cogs", amount: 98772 }],
      linkedStreamIds: [7],
      streamNames: new Map([[7, "Side Hustle Income"]]),
      detail: {
        salesEntries: [{ incomeSourceId: 7, date: "2026-09-09", description: "Received", amount: 15612, id: 11, source: "bank" }],
        costEntries: [{ incomeSourceId: 7, category: "Stock", date: "2026-09-03", description: "Stock", amount: 98772, id: 5, source: "expense", accountId: null }],
        previous: { from: "2026-08-01", to: "2026-08-31", salesByStream: new Map(), costLines: [] },
      },
    } as never) as unknown as { businesses: Array<{ costOfGoodsSoldLines: Array<{ entries: unknown[] }>; salesEntries: unknown[] }> };
    expect(report.businesses[0].costOfGoodsSoldLines[0].entries[0]).toMatchObject({ id: 5, source: "expense" });
    expect(report.businesses[0].salesEntries[0]).toMatchObject({ id: 11, source: "bank" });
  });
});
