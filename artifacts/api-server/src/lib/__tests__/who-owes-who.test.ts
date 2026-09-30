import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { workOutBalances } from "../who-owes-who";

// "But it shows no one owes me and I don't owe anyone."
describe("Who owes who, worked out from entries", () => {
  it("adds up what was borrowed and paid back, and what was lent and repaid", () => {
    const worked = workOutBalances([
      { type: "deposit", amount: 75000, linkPartyId: 1, linkKind: "borrowed" },
      { type: "disbursement", amount: 25000, linkPartyId: 1, linkKind: "pay-back" },
      { type: "disbursement", amount: 5000, isLending: true, settlesContributorId: 2 },
      { type: "deposit", amount: 2000, settlesContributorId: 2 },
    ]);
    expect(worked.get(1)).toEqual({ owedToUs: 0, owedByUs: 50000, entries: 2 });
    expect(worked.get(2)).toEqual({ owedToUs: 3000, owedByUs: 0, entries: 2 });
  });

  it("reads a Fuliza repayment with no category as paying that debt back", () => {
    const worked = workOutBalances([
      { type: "deposit", amount: 3178.08, linkPartyId: 9, linkKind: "borrowed" },
      { type: "disbursement", amount: 3178.08, settlesContributorId: 9 },
    ]);
    expect(worked.get(9)).toMatchObject({ owedByUs: 0 });
  });

  it("never goes below nothing, and ignores entries tied to nobody", () => {
    const worked = workOutBalances([
      { type: "disbursement", amount: 100, linkPartyId: 3, linkKind: "pay-back" },
      { type: "deposit", amount: 500 },
    ]);
    expect(worked.get(3)).toMatchObject({ owedByUs: 0 });
    expect(worked.size).toBe(1);
  });

  it("is offered, and set only by an owner or admin", () => {
    const route = readFileSync("src/routes/contributors.ts", "utf8");
    const post = route.slice(route.indexOf('router.post("/contributors/worked-out"'));
    expect(post).toContain("if (!requireGroupManager(req, res)) return;");
  });
});

// "I thought it should be under the Debt tab": Fuliza still owed, saved before
// imports linked it, is counted against Fuliza, which is added if missing.
describe("Fuliza from statements", () => {
  const route = readFileSync("src/routes/contributors.ts", "utf8");
  it("counts unlinked Borrowed-from-Fuliza and Fuliza repayments against Fuliza", () => {
    expect(route).toContain("tx.mpesa_receipt ~ '^F[BR][0-9]{12}$'");
    expect(route).toContain('const kind = /^FB/.test(row.receipt) ? "borrowed" as const : /^FR/.test(row.receipt) ? "pay-back" as const : null;');
    expect(route).toContain("return { ...row, linkPartyId: fulizaId, linkKind: kind };");
  });

  it("adds Safaricom PLC to Who owes who when it is not there, on confirming", () => {
    expect(route).toContain('name: "Safaricom PLC",');
    expect(route).toContain("if (fulizaId === null && (toAdd || fulizaLinks.length > 0)) {");
  });
});

// "The report will be wrong - push what is in history to it."
describe("Fuliza history", () => {
  it("links every unlinked statement Fuliza entry to the creditor when the balances are used", () => {
    const route = readFileSync("src/routes/contributors.ts", "utf8");
    expect(route).toContain("fulizaLinks.push({ transactionId: Number(row.id), kind });");
    expect(route).toContain(".onConflictDoNothing({ target: debtEntryLinksTable.transactionId });");
  });
});
