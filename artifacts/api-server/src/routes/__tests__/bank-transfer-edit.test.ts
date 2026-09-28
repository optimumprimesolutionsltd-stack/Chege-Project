import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/joint-account.ts", "utf8").replace(/\r\n/g, "\n");
const edit = route.slice(
  route.indexOf('router.put("/joint-account/transfers/bank-to-bank/:transferId"'),
  route.indexOf('router.post("/joint-account/transfers/bank-to-bank/:transferId/unpair"'),
);
const unpair = route.slice(
  route.indexOf('router.post("/joint-account/transfers/bank-to-bank/:transferId/unpair"'),
  route.indexOf('router.put("/joint-account/:id"'),
);

// A transfer between a person's own accounts could only be deleted. It is two
// rows, so it is corrected as one: both halves together, or not at all.
describe("correcting a bank-to-bank transfer", () => {
  it("changes both halves in one database transaction, and only an owner or admin may", () => {
    expect(edit).toContain("if (!requireGroupManager(req, res)) return;");
    expect(edit).toContain("await db.transaction(async (tx) => {");
    expect(edit).toContain("if (pair.length !== 2) return null;");
    expect(edit).toContain(".set({ amount, description: narration, date })");
    expect(edit).toContain("eq(jointAccountTxTable.bankTransferId, params.data.transferId)");
  });

  it("the ordinary edit still refuses one half on its own", () => {
    expect(route).toContain("Edit a bank-to-bank transfer as a transfer, so both halves change together.");
  });
});

// An M-Pesa payment to a company filed as a move to one of your own banks.
describe("a transfer that was not a transfer", () => {
  it("keeps one half as an ordinary entry and removes the other, together", () => {
    expect(unpair).toContain("if (!requireGroupManager(req, res)) return;");
    expect(unpair).toContain("await db.transaction(async (tx) => {");
    expect(unpair).toContain("await tx.delete(jointAccountTxTable)");
    expect(unpair).toContain("bankTransferId: null,");
    expect(unpair).toContain("bankTransferAccountId: null,");
  });

  it("money out kept needs a real category of this budget", () => {
    expect(unpair).toContain('if (kept.type === "disbursement" && !expenseCategory)');
    expect(unpair).toContain('res.status(400).json({ error: "Choose a valid budget category." });');
  });
});
