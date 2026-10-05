import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { debtPartyName, emptyTransactionDetails, type TxRow } from "../../lib/describe-transaction";

const bank = readFileSync("src/routes/joint-account.ts", "utf8");

// An M-Pesa import filed a 75,000 payment as "paying back Ujenzi Distributors"
// and linked it to Ujenzi. The payment was later set to Hermda trders, which
// is who it really went to - but the list still said "Paid to Ujenzi", and
// deleting it would have handed the 75,000 back to Ujenzi's balance.
describe("the payee on a posting outranks an older debt link", () => {
  const tx = (fields: Partial<TxRow>) => ({ id: 7, isBorrowing: false, isLending: false, settlesContributorId: null, ...fields }) as TxRow;
  const details = () => {
    const found = emptyTransactionDetails();
    found.partyNames.set(3, "Hermda trders");
    found.linkedPartyNames.set(7, "Ujenzi Distributors");
    return found;
  };

  it("titles the row after the party chosen on it", () => {
    expect(debtPartyName(tx({ settlesContributorId: 3 }), details())).toBe("Hermda trders");
  });

  it("still reads the link for borrowing, which names nobody on the row", () => {
    expect(debtPartyName(tx({ isBorrowing: true }), details())).toBe("Ujenzi Distributors");
  });

  it("falls back to the link when the row's party is not in this budget", () => {
    expect(debtPartyName(tx({ settlesContributorId: 99 }), details())).toBe("Ujenzi Distributors");
  });

  it("stays scoped to this budget", () => {
    const loader = readFileSync("src/lib/transaction-details.ts", "utf8");
    expect(loader).toContain("eq(groupContributorsTable.groupId, groupId)");
    expect(loader).toContain("eq(debtEntryLinksTable.groupId, groupId)");
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
