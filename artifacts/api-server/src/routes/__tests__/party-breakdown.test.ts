import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { entryEffect, workOutBalances } from "../../lib/who-owes-who";

const route = readFileSync(join(__dirname, "..", "contributors.ts"), "utf8");

// "check on who owes who why judys money is 680,100- where isit coming from" (17 Oct 2026).
describe("GET /contributors/:id/breakdown", () => {
  it("counts each entry the way the worked-out balance does", () => {
    const rows = [
      { type: "deposit", amount: 500000, linkPartyId: 7, linkKind: "borrowed" },
      { type: "deposit", amount: 200000, linkPartyId: 7, linkKind: "borrowed" },
      { type: "disbursement", amount: 100000, linkPartyId: 7, linkKind: "pay-back" },
    ];
    const total = rows.reduce((sum, row) => sum + (entryEffect(row)?.owedByUs ?? 0), 0);
    expect(total).toBe(600000);
    expect(workOutBalances(rows).get(7)?.owedByUs).toBe(600000);
  });

  it("lists the person's entries and what no entry explains", () => {
    const body = route.slice(route.indexOf('router.get("/contributors/:id/breakdown"'), route.indexOf('router.patch("/contributors/:id"'));
    expect(body).toContain("(link.party_id = ${id} OR (link.party_id IS NULL AND tx.settles_contributor_id = ${id}))");
    expect(body).toContain("notFromEntries: { owedToUs: cents(now.owedToUs - fromEntries.owedToUs), owedByUs: cents(now.owedByUs - fromEntries.owedByUs) },");
  });
});
