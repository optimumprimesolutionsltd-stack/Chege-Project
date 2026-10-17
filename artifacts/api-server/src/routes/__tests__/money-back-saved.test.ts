import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(join(__dirname, "..", "joint-account.ts"), "utf8");
const body = route.slice(route.indexOf('router.post("/joint-account/:id/money-back"'), route.indexOf('router.put("/joint-account/:id"'));

// "where is the category logic in money in. i cant see it" (17 Oct 2026).
describe("POST /joint-account/:id/money-back", () => {
  it("only turns money in, not a move between own accounts or savings", () => {
    expect(body).toContain(`if (existing.type !== "deposit")`);
    expect(body).toContain("existing.bankTransferId !== null || existing.savingsGoalId !== null");
    expect(body).toContain("await refuseWhileReversed(existing.id, groupId)");
  });

  it("keeps the entry and makes it a refund, so the balance does not move", () => {
    expect(body).toContain(`type: "disbursement",`);
    expect(body).toContain("amount: -Math.abs(Number(existing.amount)),");
    expect(body).toContain("incomeSourceId: null,");
    expect(body).not.toContain("mpesaReceipt");
  });

  it("drops what made it money in, inside one transaction", () => {
    expect(body).toContain("transaction.delete(jointAccountDepositSplitsTable)");
    expect(body).toContain("transaction.delete(debtEntryLinksTable)");
  });
});
