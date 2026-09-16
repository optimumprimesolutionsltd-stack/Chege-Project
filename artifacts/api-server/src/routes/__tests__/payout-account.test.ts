import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../payouts.ts", import.meta.url), "utf8");
const form = readFileSync(
  new URL("../../../../mobile-budget/components/MerryGoRound.tsx", import.meta.url),
  "utf8",
);

// A payout is money leaving a named account, and which account it left is the
// whole basis of reconciling the round later. The route used to take the first
// account by id when none was given, deciding that silently.
describe("a merry-go-round payout names the account it came from", () => {
  it("refuses to guess when the group has more than one account", () => {
    expect(route).toContain("groupAccounts.length === 1 ? groupAccounts[0] : null");
    expect(route).toContain("Choose which bank account the payout comes out of.");
    // The old behaviour: whichever account had the lowest id.
    expect(route).not.toContain("parsed.data.accountId === undefined\n      ? eq(bankAccountsTable.groupId, groupId)");
  });

  it("still resolves on its own when there is only one account", () => {
    // No accountId plus exactly one account resolves to that account; the
    // caller is only asked when there is a genuine choice to make.
    const resolution = route.slice(route.indexOf("const account ="), route.indexOf("if (!account) {"));
    expect(resolution).toContain("parsed.data.accountId === undefined");
    expect(resolution).toContain("groupAccounts.length === 1 ? groupAccounts[0] : null");
  });

  it("rejects an account belonging to another group", () => {
    expect(route).toContain("groupAccounts.find((row) => row.id === parsed.data.accountId) ?? null");
    expect(route).toContain("That bank account is not in this group.");
  });

  it("still creates the bank withdrawal that the payout represents", () => {
    // The payout has always been tied to a disbursement; that must not regress.
    expect(route).toContain("type: \"disbursement\"");
    expect(route).toContain("transactionId: movement.id");
  });
});

describe("the payout form asks which account", () => {
  it("sends the chosen account", () => {
    expect(form).toContain("accountId: effectiveAccountId ?? undefined,");
  });

  it("does not let a payout be recorded without one", () => {
    expect(form).toContain("if (!effectiveAccountId) {");
    expect(form).toContain("Say which bank account this payout comes out of.");
  });

  it("does not make someone choose when there is nothing to choose", () => {
    expect(form).toContain("const soleAccountId = bankAccounts.length === 1 ? bankAccounts[0].id : null;");
    expect(form).toContain("Comes out of ");
  });

  it("offers a chip per account when there are several", () => {
    expect(form).toContain("testID={`payout-account-${bankAccount.id}`}");
    expect(form).toContain("Paid from ");
  });
});
