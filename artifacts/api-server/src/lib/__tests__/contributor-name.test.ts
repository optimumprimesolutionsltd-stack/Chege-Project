import { describe, expect, it } from "vitest";
import {
  contributorNameProblem,
  isSingleName,
  memberLedgerName,
  normalizeContributorName,
} from "../contributor-name";

describe("normalizeContributorName", () => {
  it("trims and collapses whitespace so one person is one row", () => {
    expect(normalizeContributorName("  Jane   Wanjiku ")).toBe("Jane Wanjiku");
  });
});

describe("contributorNameProblem", () => {
  it("accepts two names", () => {
    expect(contributorNameProblem("Jane Wanjiku")).toBeNull();
  });

  it("accepts the three and four names Kenyan records often carry", () => {
    expect(contributorNameProblem("John Kamau Mwangi")).toBeNull();
    expect(contributorNameProblem("Abdi Hassan Noor Farah")).toBeNull();
  });

  it("accepts hyphenated and apostrophed names as one part each", () => {
    expect(contributorNameProblem("Anne-Marie Otieno")).toBeNull();
    expect(contributorNameProblem("Mary O'Brien")).toBeNull();
  });

  it("accepts an initial alongside a surname", () => {
    expect(contributorNameProblem("J. Wanjiku")).toBeNull();
  });

  it("rejects a single name, which cannot be told from the next John", () => {
    expect(contributorNameProblem("John")).toBe("single-name");
    expect(contributorNameProblem("  Mary  ")).toBe("single-name");
  });

  it("rejects a single name padded with punctuation", () => {
    expect(contributorNameProblem("John .")).toBe("single-name");
    expect(contributorNameProblem("Anne-Marie")).toBe("single-name");
  });

  it("rejects nothing at all", () => {
    expect(contributorNameProblem("   ")).toBe("empty");
  });

  it("rejects a name past the column limit", () => {
    expect(contributorNameProblem(`${"a".repeat(60)} ${"b".repeat(61)}`)).toBe("too-long");
  });

  it("measures length after collapsing, so padding alone does not fail", () => {
    expect(contributorNameProblem(`Jane${" ".repeat(40)}Wanjiku`)).toBeNull();
  });
});

describe("isSingleName", () => {
  it("flags legacy rows without flagging blank or over-long ones", () => {
    expect(isSingleName("John")).toBe(true);
    expect(isSingleName("John Kamau")).toBe(false);
    expect(isSingleName("")).toBe(false);
  });
});

describe("memberLedgerName", () => {
  it("keeps the surname, which taking firstName alone threw away", () => {
    expect(memberLedgerName(null, "John", "Kamau")).toBe("John Kamau");
  });

  it("uses the name the person chose when it identifies them on its own", () => {
    // preferredName is mirrored into firstName, so concatenating first and
    // last would read "Jane Wanjiku Wanjiku".
    expect(memberLedgerName("Jane Wanjiku", "Jane Wanjiku", "Wanjiku")).toBe("Jane Wanjiku");
  });

  it("prefers the provider's pair over a chosen single word", () => {
    // Somebody who typed "John" while signing in through Google as John Kamau
    // is better identified by the pair than by their own one word. This is the
    // case that the old lastName: null made impossible.
    expect(memberLedgerName("John", "John", "Kamau")).toBe("John Kamau");
  });

  it("falls back to whichever single name exists rather than refusing", () => {
    // A deposit must never fail for want of a surname; the sheet flags it.
    expect(memberLedgerName("John", "John", null)).toBe("John");
    expect(memberLedgerName(null, "John", null)).toBe("John");
    expect(memberLedgerName(null, null, "Kamau")).toBe("Kamau");
  });

  it("reports nothing when the account has no name at all", () => {
    expect(memberLedgerName(null, null, null)).toBeNull();
    expect(memberLedgerName("", "  ", "")).toBeNull();
  });
});
