import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/joint-account.ts", "utf8").replace(/\r\n/g, "\n");
const block = route.slice(route.indexOf('router.post("/joint-account/transfers/bank-to-bank"'), route.indexOf("// DELETE /joint-account/:id") > 0 ? route.indexOf('router.put("/joint-account/:id"') : undefined);

// Money passing through M-Pesa between a person's own accounts is a transfer,
// not income and not spending, and must still be recognised next time.
describe("a bank-to-bank transfer that came from M-Pesa", () => {
  it("accepts a receipt and says which account it belongs to", () => {
    expect(route).toContain("mpesaReceipt: z.string().trim().regex(/^[A-Z0-9]{8,15}$/).optional()");
    expect(route).toContain("mpesaAccountId: z.number().int().positive().optional()");
    expect(block).toContain("Say which of the two accounts the M-Pesa receipt belongs to.");
  });

  it("refuses a receipt the budget already has", () => {
    expect(block).toContain("const clash = await alreadyRecorded(groupId, mpesaReceipt);");
    expect(block).toContain("res.status(409).json(clash)");
  });

  it("puts the receipt on the M-Pesa side only, since a receipt is unique in a budget", () => {
    expect(block).toContain("mpesaReceipt: mpesaReceipt && mpesaAccountId === source.id ? mpesaReceipt : null");
    expect(block).toContain("mpesaReceipt: mpesaReceipt && mpesaAccountId === destination.id ? mpesaReceipt : null");
  });
});
