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
    expect(handler).toContain("ledgerTotals(db, groupId, ledgerAccountId, today),");
    // The sums themselves are in lib/account-ledger, as at that date.
    const ledger = readFileSync(new URL("../../lib/account-ledger.ts", import.meta.url), "utf8");
    expect(ledger).toContain("const happened = sql`${tx.date} <= ${today}::date`;");
    expect(ledger).toContain("FILTER (WHERE ${tx.type} = 'deposit' AND ${happened})");
  });
  it("keeps the per-row running balance on the whole ledger so the rows still add up", () => {
    // Each row: opening balance plus every entry up to and including it, future ones included.
    expect(handler).toContain("runningBalance: isAggregate ? null : openingBalance + page.rows[index].sumThroughThis,");
  });
});
