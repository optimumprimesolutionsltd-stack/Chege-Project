import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeTransaction, emptyTransactionDetails, reversalPairing, type ReversalLinkRow, type TxRow } from "./describe-transaction";

const tx = (fields: Partial<TxRow>) => ({
  id: 1, groupId: 9, type: "disbursement", amount: 100, madeById: null, savingsGoalId: null,
  bankTransferAccountId: null, isBorrowing: false, isLending: false, settlesContributorId: null,
  createdAt: new Date("2026-10-05T10:00:00Z"), ...fields,
}) as TxRow;

describe("an entry described from what was fetched for the whole list", () => {
  it("names who made it, its savings goal and the account at the other end", () => {
    const details = emptyTransactionDetails();
    details.memberNames.set("u1", "Grace");
    details.savingsGoalNames.set(4, "M-Shwari");
    details.accountNames.set(2, "KCB");
    const shown = describeTransaction(tx({ madeById: "u1", savingsGoalId: 4, bankTransferAccountId: 2 }), details);
    expect(shown.madeByName).toBe("Grace");
    expect(shown.savingsGoalName).toBe("M-Shwari");
    expect(shown.bankTransferAccountName).toBe("KCB");
    expect(shown.createdAt).toBe("2026-10-05T10:00:00.000Z");
  });

  it("names nobody it could not find in this budget", () => {
    const shown = describeTransaction(tx({ madeById: "stranger", savingsGoalId: 5, bankTransferAccountId: 6 }), emptyTransactionDetails());
    expect(shown.madeByName).toBeNull();
    expect(shown.savingsGoalName).toBeNull();
    expect(shown.bankTransferAccountName).toBeNull();
  });

  it("names a deposit after its contributors, and only a deposit", () => {
    const details = emptyTransactionDetails();
    const split = { transactionId: 1, userId: "u2", amount: 50, incomeSourceId: null, userName: "Frederick" };
    details.splits.set(1, [split]);
    details.memberNames.set("u1", "Grace");
    expect(describeTransaction(tx({ type: "deposit", madeById: "u1" }), details).madeByName).toBe("Frederick");
    details.splits.set(1, [split, { ...split, userId: null, userName: null }]);
    const two = describeTransaction(tx({ type: "deposit", madeById: "u1" }), details);
    expect(two.madeByName).toBe("2 contributors");
    expect(two.contributorSplits[1].userName).toBe("Member");
    expect(describeTransaction(tx({ type: "disbursement", madeById: "u1" }), details).contributorSplits).toEqual([]);
  });

  it("pairs each half of a reversal with the other", () => {
    const details = emptyTransactionDetails();
    const link = { reversalTransactionId: 2, originalTransactionId: 1, groupId: 9 } as ReversalLinkRow;
    details.reversalLinks.set(1, link);
    details.reversalLinks.set(2, link);
    details.reversalOthers.set(1, { description: "Paid to Naivas", date: "2026-10-01" });
    details.reversalOthers.set(2, { description: null, date: "2026-10-02" });
    expect(reversalPairing(tx({ id: 2 }), details)).toEqual({ role: "money_back", otherTransactionId: 1, otherDescription: "Paid to Naivas", otherDate: "2026-10-01" });
    expect(reversalPairing(tx({ id: 1 }), details)).toEqual({ role: "reversed_payment", otherTransactionId: 2, otherDescription: "", otherDate: "2026-10-02" });
    expect(reversalPairing(tx({ id: 3 }), details)).toBeNull();
  });
});

describe("the account list does not query once per entry", () => {
  const route = readFileSync("src/routes/joint-account.ts", "utf8");

  it("describes the whole list in one go", () => {
    expect(route).toContain("const enriched = await enrichTransactions(page.rows.map(({ entry }) => entry), groupId);");
    expect(route).not.toMatch(/txs\.map\(\(tx\) => enrichTx\(/);
  });
});
