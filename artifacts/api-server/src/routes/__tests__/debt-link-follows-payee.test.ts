import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bank = readFileSync("src/routes/joint-account.ts", "utf8");

// An M-Pesa import filed a 75,000 payment as "paying back Ujenzi Distributors"
// and linked it to Ujenzi. The payment was later set to Hermda trders, which
// is who it really went to - but the list still said "Paid to Ujenzi", and
// deleting it would have handed the 75,000 back to Ujenzi's balance.
describe("the payee on a posting outranks an older debt link", () => {
  const lookup = bank.slice(bank.indexOf("async function debtPartyNameFor"), bank.indexOf("async function debtPartyNameFor") + 1600);

  it("titles the row after the party chosen on it", () => {
    expect(lookup).toContain("if (tx.settlesContributorId) {");
    expect(lookup.indexOf("if (tx.settlesContributorId) {")).toBeLessThan(lookup.indexOf(".from(debtEntryLinksTable)"));
  });

  it("still reads the link for borrowing, which names nobody on the row", () => {
    expect(lookup).toContain("return linked?.name ?? null;");
  });

  it("stays scoped to this budget", () => {
    expect(lookup).toContain("eq(groupContributorsTable.groupId, groupId)");
  });
});

describe("changing who a posting was for moves its link", () => {
  const helper = bank.slice(bank.indexOf("async function debtLinkFollowsParty"));

  it("repoints the link on every edit that names a party", () => {
    expect((bank.match(/await debtLinkFollowsParty\(updated\.id, groupId, updated\.settlesContributorId\);/g) ?? []).length).toBe(2);
  });

  it("leaves an entry naming nobody alone, such as money borrowed", () => {
    expect(helper).toContain("if (partyId === null) return;");
  });

  it("touches only this posting's link, in this budget, and only when it differs", () => {
    expect(helper).toContain("eq(debtEntryLinksTable.transactionId, transactionId)");
    expect(helper).toContain("eq(debtEntryLinksTable.groupId, groupId)");
    expect(helper).toContain("ne(debtEntryLinksTable.partyId, partyId)");
  });

  it("keeps the kind and moves no balance - that stays the person's choice", () => {
    expect(helper).toContain(".set({ partyId })");
    expect(helper.slice(0, helper.indexOf("\n}"))).not.toContain("owedByUs");
  });
});
