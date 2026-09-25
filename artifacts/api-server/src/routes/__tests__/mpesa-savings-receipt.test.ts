import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/joint-account.ts", "utf8").replace(/\r\n/g, "\n");
const savings = route.slice(route.indexOf("async function createSavingsTransfer"), route.indexOf('router.post("/joint-account/transfers/to-savings"'));

// Money from an M-Pesa message or statement going into (or out of) a savings goal must be
// recognised next time, like every other kind of posting.
describe("a savings transfer that came from M-Pesa", () => {
  it("accepts the receipt", () => {
    expect(route).toContain("mpesaReceipt: MpesaReceipt.optional(),");
  });
  it("refuses a receipt the budget already has", () => {
    expect(savings).toContain("alreadyRecorded(groupId, parsed.data.mpesaReceipt)");
    expect(savings).toContain("res.status(409).json(savingsClash)");
  });
  it("stores it on the bank posting", () => {
    expect(savings).toContain("mpesaReceipt: parsed.data.mpesaReceipt ?? null,");
  });
});
