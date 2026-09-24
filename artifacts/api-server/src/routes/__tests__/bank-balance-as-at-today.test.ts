import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bank = readFileSync(new URL("../joint-account.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const handler = bank.slice(bank.indexOf('router.get("/joint-account", async'), bank.indexOf('router.patch("/joint-account/opening-balance"'));

// Reported as: "in banking i want to see the balance as per the actual date".
// The headline added every entry, so one dated next week already moved today's
// balance.
describe("the bank balance is as at today", () => {
  it("counts only entries dated today or earlier (Kenyan date)", () => {
    expect(handler).toContain("const today = currentBusinessDate();");
    expect(handler).toContain("const happened = txs.filter(t => dayOf(t.date) <= today);");
    expect(handler).toContain("const ledgerDeposits = happened.filter");
    expect(handler).toContain("const totalDeposits = happened.filter");
  });
  it("keeps the per-row running balance on the whole ledger so the rows still add up", () => {
    expect(handler).toContain("let balanceCursor = openingBalance + fullDeposits - fullDisbursements;");
  });
});
