import { describe, expect, it } from "vitest";
import { filterStatementToRange, formatStatementDate, prorateExpected, type ContributionStatement } from "./contribution-statement";

function statement(): ContributionStatement {
  return {
    periodLabel: "Jul 2026 – Sep 2026",
    contributors: [
      { id: 1, name: "Mary", userId: "u-mary", monthlyTarget: 2000 },
      { id: 2, name: "John", userId: null, monthlyTarget: null },
    ],
    entries: [
      { contributorId: 1, contributorName: "Mary", date: "2026-07-01", amount: 2000, source: "recorded", description: null, bankName: null },
      { contributorId: 1, contributorName: "Mary", date: "2026-08-14", amount: 2500, source: "deposit", description: "Aug top-up", bankName: "Equity" },
      { contributorId: 2, contributorName: "John", date: "2026-08-20", amount: 1500, source: "deposit", description: null, bankName: "Equity" },
      { contributorId: 1, contributorName: "Mary", date: "2026-09-05", amount: 3000, source: "deposit", description: null, bankName: "Equity" },
    ],
    totalsByContributor: { 1: 7500, 2: 1500 },
    grandTotal: 9000,
    // Money that reached the bank belonging to nobody. Dated inside and
    // outside the ranges the tests narrow to, so the filtering is exercised.
    groupFunding: [
      { transactionId: 91, date: "2026-07-05", description: "Harambee", amount: 1500, bankName: "Equity" },
      { transactionId: 92, date: "2026-09-20", description: "Fundraiser", amount: 2500, bankName: null },
    ],
    groupFundingTotal: 4000,
  };
}

describe("formatStatementDate", () => {
  it("renders a day form", () => {
    expect(formatStatementDate("2026-09-05")).toBe("5 Sep 2026");
  });
});

describe("filterStatementToRange", () => {
  it("keeps only entries on or between the two days", () => {
    const result = filterStatementToRange(statement(), { from: "2026-08-01", to: "2026-08-31" });
    expect(result.entries.map((entry) => entry.date)).toEqual(["2026-08-14", "2026-08-20"]);
    expect(result.grandTotal).toBe(4000);
    expect(result.totalsByContributor).toEqual({ 1: 2500, 2: 1500 });
    expect(result.periodLabel).toBe("1 Aug 2026 – 31 Aug 2026");
  });

  it("includes a month's recorded entry when the range starts mid-month", () => {
    // The recorded July entry sits on 2026-07-01, so a range from 2026-07-10
    // would miss it — but a range covering the 1st keeps it.
    const kept = filterStatementToRange(statement(), { from: "2026-07-01", to: "2026-07-15" });
    expect(kept.entries.map((entry) => entry.date)).toEqual(["2026-07-01"]);

    const missed = filterStatementToRange(statement(), { from: "2026-07-10", to: "2026-07-31" });
    expect(missed.entries).toHaveLength(0);
  });

  it("normalises a reversed range", () => {
    const result = filterStatementToRange(statement(), { from: "2026-09-30", to: "2026-08-01" });
    expect(result.entries.map((entry) => entry.date)).toEqual(["2026-08-14", "2026-08-20", "2026-09-05"]);
    expect(result.periodLabel).toBe("1 Aug 2026 – 30 Sep 2026");
  });

  it("carries the contributor list through unchanged", () => {
    const result = filterStatementToRange(statement(), { from: "2026-01-01", to: "2026-01-02" });
    expect(result.entries).toHaveLength(0);
    expect(result.contributors).toHaveLength(2);
    expect(result.grandTotal).toBe(0);
  });
});

describe("prorateExpected", () => {
  it("returns the full target for a whole 30-day month", () => {
    expect(prorateExpected(3000, "2026-09-01", "2026-09-30")).toBe(3000);
  });

  it("prorates a half-covered 30-day month", () => {
    // Sep 16-30 is 15 of September's 30 days.
    expect(prorateExpected(3000, "2026-09-16", "2026-09-30")).toBe(1500);
  });

  it("treats a 31-day month differently from a 30-day one for the same day count", () => {
    // Aug 1-15 is 15 of August's 31 days, not the same fraction as 15/30.
    const augustHalf = prorateExpected(3100, "2026-08-01", "2026-08-15");
    expect(augustHalf).toBe(1500); // 3100 * 15/31 = 1500
  });

  it("handles February correctly, leap or not", () => {
    expect(prorateExpected(2800, "2026-02-01", "2026-02-28")).toBe(2800); // 2026: not a leap year, 28 days
    expect(prorateExpected(2900, "2028-02-01", "2028-02-29")).toBe(2900); // 2028: leap year, 29 days
  });

  it("sums a fair share across each month a range spans, not a whole month for each", () => {
    // Aug 20-31 (12 of 31 days) + Sep 1-10 (10 of 30 days), same target each month.
    const result = prorateExpected(3100, "2026-08-20", "2026-09-10");
    const augustShare = Math.round(3100 * (12 / 31));
    const septemberShare = Math.round(3100 * (10 / 30));
    expect(result).toBe(augustShare + septemberShare);
  });

  it("normalises a reversed range the same way as the forward one", () => {
    expect(prorateExpected(3000, "2026-09-30", "2026-09-16")).toBe(prorateExpected(3000, "2026-09-16", "2026-09-30"));
  });

  it("prorates a single day as one day's share of its month", () => {
    expect(prorateExpected(3000, "2026-09-15", "2026-09-15")).toBe(100); // 3000/30 = 100
  });
});

// A deposit with no contributor is Shared group funding, not anyone's
// contribution. Leaving it out of the ledger is right; leaving it out silently
// is what made a report read nil in one place and show figures in another.
describe("group funding in a narrowed statement", () => {
  it("keeps only what falls inside the range", () => {
    const narrowed = filterStatementToRange(statement(), { from: "2026-09-01", to: "2026-09-30" });
    expect(narrowed.groupFunding.map((entry) => entry.transactionId)).toEqual([92]);
    expect(narrowed.groupFundingTotal).toBe(2500);
  });

  it("never counts it as somebody's contribution", () => {
    const narrowed = filterStatementToRange(statement(), { from: "2026-09-01", to: "2026-09-30" });
    const contributed = Object.values(narrowed.totalsByContributor).reduce((sum, value) => sum + value, 0);
    // The grand total is exactly what the contributors gave, and the group
    // funding sits outside it — crediting it to anybody would overstate what
    // they contributed, which is the reason it was excluded in the first place.
    expect(narrowed.grandTotal).toBe(contributed);
    expect(narrowed.groupFundingTotal).toBeGreaterThan(0);
    expect(narrowed.grandTotal).not.toBe(contributed + narrowed.groupFundingTotal);
  });

  it("reports nothing when the range holds none", () => {
    const narrowed = filterStatementToRange(statement(), { from: "2026-08-01", to: "2026-08-31" });
    expect(narrowed.groupFunding).toEqual([]);
    expect(narrowed.groupFundingTotal).toBe(0);
  });
});
