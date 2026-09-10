import { describe, expect, it } from "vitest";
import { filterStatementToRange, formatStatementDate, type ContributionStatement } from "./contribution-statement";

function statement(): ContributionStatement {
  return {
    periodLabel: "Jul 2026 – Sep 2026",
    contributors: [
      { id: 1, name: "Mary", userId: "u-mary" },
      { id: 2, name: "John", userId: null },
    ],
    entries: [
      { contributorId: 1, contributorName: "Mary", date: "2026-07-01", amount: 2000, source: "recorded", description: null },
      { contributorId: 1, contributorName: "Mary", date: "2026-08-14", amount: 2500, source: "deposit", description: "Aug top-up" },
      { contributorId: 2, contributorName: "John", date: "2026-08-20", amount: 1500, source: "deposit", description: null },
      { contributorId: 1, contributorName: "Mary", date: "2026-09-05", amount: 3000, source: "deposit", description: null },
    ],
    totalsByContributor: { 1: 7500, 2: 1500 },
    grandTotal: 9000,
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
