import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evaluateAmountExpression } from "@/lib/amount-expression";

const bank = readFileSync(fileURLToPath(new URL("./bank.tsx", import.meta.url)), "utf8");
const webParser = readFileSync(fileURLToPath(new URL("../lib/amount-expression.ts", import.meta.url)), "utf8");
const phoneParser = readFileSync(
  fileURLToPath(new URL("../../../mobile-budget/lib/amountExpression.ts", import.meta.url)),
  "utf8",
);

// The phone gained arithmetic in amount fields, parties, and settling what
// stands between you. The laptop had none of it, so the two had diverged on
// what the same account could be told.
describe("the amount field does arithmetic here too", () => {
  it("resolves a sum", () => {
    expect(evaluateAmountExpression("1200+800+450")).toBe(2450);
  });

  it("is the same parser as the phone's, character for character", () => {
    // Copied rather than shared, because adding a workspace package here means
    // an install and this repo's install rewrites some 1600 lockfile lines. A
    // fix to one that misses the other fails here rather than drifting.
    const strip = (source: string) => source.slice(source.indexOf("/** Characters a person might reach for"));
    expect(strip(webParser)).toBe(strip(phoneParser));
  });

  it("takes text, because a number field cannot hold a plus", () => {
    expect(bank).toContain('type="text"');
    expect(bank).toContain('placeholder="e.g. 20000, or 1200+800+450"');
  });

  it("reads the worked-out figure wherever it read an amount", () => {
    expect(bank).toContain("function readAmount(value: string): number | null {");
    expect(bank).toContain("const outgoingAmount = readAmount(amount);");
  });
});

describe("paying somebody you owe", () => {
  it("offers the party as a destination", () => {
    expect(bank).toContain('data-testid="button-dest-party"');
    expect(bank).toContain("Someone I owe");
  });

  it("still sends a destination the API knows", () => {
    // Paying a party is a categorised withdrawal: the money left and belongs
    // to a category. Who received it is held beside that, not instead of it.
    expect(bank).toContain('const sentDestinationKind = withdrawalDestinationKind === "party" ? "category" : withdrawalDestinationKind;');
    expect(bank).not.toContain("destinationKind: withdrawalDestinationKind");
  });

  it("lets somebody be added here, recorded or not", () => {
    // A way in hidden behind the thing it creates is no way in at all — the
    // mistake made twice on the phone.
    expect(bank).toContain('data-testid="add-party-form"');
    expect(bank).toContain('data-testid="checkbox-party-institution"');
  });
});

describe("somebody paying you back", () => {
  it("asks, and defaults to no", () => {
    expect(bank).toContain('data-testid="repayment-picker"');
    // The question now has three answers, not two. See web-borrowing.test.ts.
    expect(bank).toContain("What kind of money is this?");
    expect(bank).toContain('<option value="none">Ordinary money in</option>');
  });

  it("sends it as a settlement, never as income", () => {
    expect(bank).toContain('...(mode === "deposit" && repayingParty ? { settlesContributorId: repayingParty.id } : {}),');
    expect(bank).toContain('...(mode === "deposit" && !repayingParty && !isBorrowing && contributorSplits.length === 0 ? { incomeSourceId } : {}),');
  });

  it("puts the depositor question aside, a repayment being no contribution", () => {
    expect(bank).toContain('{mode === "deposit" && !repayingParty && !isBorrowing && (');
  });

  it("can record who owes you, which exists nowhere else", () => {
    expect(bank).toContain('data-testid="add-debtor-form"');
    expect(bank).toContain("void createParty({ owing: true })");
    expect(bank).toContain('...(owing ? { owedToUs: toMoney(owed) } : { owedByUs: toMoney(owed) }),');
  });
});

describe("settling afterwards", () => {
  it("asks rather than applying", () => {
    expect(bank).toContain("if (!window.confirm(question)) return;");
  });

  it("reads who was involved before the form is cleared", () => {
    // Sliced forward from wasNew: finishEntry appears in several branches, so
    // an indexOf for it finds one earlier in the file and the slice inverts.
    const start = bank.indexOf("const wasNew = !editingTransaction;");
    const handler = bank.slice(start, bank.indexOf("finishEntry(keepOpen", start));
    expect(handler).toContain("const paidParty =");
    expect(handler).toContain("const repaidBy =");
  });

  it("only asks on a new posting", () => {
    // Asking after an edit would move the balance twice for one payment.
    expect(bank).toContain("if (wasNew && repaidBy) offerBalanceChange(repaidBy, total, \"owedToUs\");");
    expect(bank).toContain("else if (wasNew && paidParty) offerBalanceChange(paidParty, total, \"owedByUs\");");
  });

  it("never drives a balance below zero", () => {
    expect(bank).toContain("const remaining = Math.max(0, owed - paid);");
  });
});
