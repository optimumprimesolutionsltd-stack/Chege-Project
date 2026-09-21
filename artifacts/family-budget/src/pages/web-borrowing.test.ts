import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const bank = readFileSync(fileURLToPath(new URL("./bank.tsx", import.meta.url)), "utf8");

// A deposit could be exactly two things here as well: ordinary money in, or
// somebody paying you back. Borrowed money is neither, so it landed in the
// first — inflating income with money that has to be repaid, and recording no
// debt at all.
describe("a deposit can be money you borrowed", () => {
  it("is a third answer to the same question", () => {
    expect(bank).toContain("What kind of money is this?");
    expect(bank).toContain('<option value="borrow:none">Borrowed — from somewhere else</option>');
  });

  it("groups the two kinds of answer rather than mixing them", () => {
    expect(bank).toContain('<optgroup label="Somebody paying you back">');
    expect(bank).toContain('<optgroup label="Borrowed — not income">');
  });

  it("can name a tracked debt or a party", () => {
    expect(bank).toContain("value={`borrow:debt:${debt.name}`}");
    expect(bank).toContain("value={`borrow:party:${party.id}`}");
  });

  it("offers borrowing from anybody, not only somebody already owed", () => {
    const group = bank.slice(bank.indexOf('<optgroup label="Borrowed — not income">'), bank.indexOf('value="borrow:none"'));
    expect(group).toContain("{parties.map((party) => (");
    expect(group).not.toContain("owingParties.map");
  });

  it("reads the select's value back into what it means", () => {
    // One control, three meanings, so the prefix has to be unambiguous: a
    // party id can never start with "borrow:".
    expect(bank).toContain('repayingPartyId.startsWith("borrow:debt:")');
    expect(bank).toContain('repayingPartyId.startsWith("borrow:party:")');
    // Never spanning a line: these files are CRLF on disk.
    expect(bank).toContain('const repayingParty = repayingPartyId.startsWith("borrow:")');
  });
});

describe("borrowed money is not income", () => {
  it("says so on the transaction", () => {
    expect(bank).toContain('...(mode === "deposit" && isBorrowing ? { isBorrowing: true } : {}),');
  });

  it("takes no income source", () => {
    expect(bank).toContain('...(mode === "deposit" && !repayingParty && !isBorrowing && contributorSplits.length === 0 ? { incomeSourceId } : {}),');
  });

  it("asks nobody whose contribution it was", () => {
    expect(bank).toContain('{mode === "deposit" && !repayingParty && !isBorrowing && (');
  });

  it("tells the person, where they are deciding it", () => {
    expect(bank).toContain('data-testid="borrowing-note"');
    expect(bank).toContain("a loan is not earnings, and you will pay it back");
  });
});

describe("adding it to what you owe", () => {
  it("asks rather than applying, like every other balance change", () => {
    expect(bank).toContain("const offerDebtIncrease = (categoryName: string, amount: number) => {");
    expect(bank).toContain("const offerBorrowedFromParty = (party: Party, amount: number) => {");
    expect((bank.match(/if \(!window\.confirm\(/g) ?? []).length).toBe(3);
  });

  it("works on a debt that starts at nothing outstanding", () => {
    // A brand-new loan is the whole point, and offerBalanceChange's owed > 0
    // guard would have thrown it away.
    expect(bank).toContain('const owed = typeof party.owedByUs === "number" ? party.owedByUs : 0;');
    expect(bank).toContain('if (!debt || typeof owed !== "number" || amount <= 0) return;');
  });

  it("adds rather than subtracts", () => {
    expect((bank.match(/owed \+ borrowed/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("only on a new deposit, never on an edit", () => {
    expect(bank).toContain('else if (wasNew && borrowedAgainst?.kind === "debt") offerDebtIncrease(borrowedAgainst.name, total);');
    expect(bank).toContain('else if (wasNew && borrowedAgainst?.kind === "party" && borrowedFrom) offerBorrowedFromParty(borrowedFrom, total);');
  });
});
