/**
 * The who-has-paid grid.
 *
 * "Who has slipped" is the question, so the cases that matter are the empty
 * ones: somebody who has paid nothing must still have a row, and a month with
 * no payment must still have a cell. A report that quietly omits the people it
 * exists to show is worse than no report.
 */

import { describe, expect, it } from "vitest";
import { buildContributionGrid, gridMonths, type GridContributor } from "../contribution-grid";

const months = [
  { month: 7, year: 2026, label: "Jul 2026" },
  { month: 8, year: 2026, label: "Aug 2026" },
  { month: 9, year: 2026, label: "Sep 2026" },
];

const contributors: GridContributor[] = [
  { id: 1, name: "Grace Achieng", monthlyTarget: 1_000 },
  { id: 2, name: "John Kamau", monthlyTarget: 1_000 },
  { id: 3, name: "Mary Wanjiku", monthlyTarget: 1_000 },
];

describe("gridMonths", () => {
  it("ends with the current month, oldest first", () => {
    expect(gridMonths(3, new Date(2026, 8, 15)).map((m) => `${m.year}-${m.month}`))
      .toEqual(["2026-7", "2026-8", "2026-9"]);
  });

  it("crosses a year boundary without losing a month", () => {
    expect(gridMonths(3, new Date(2027, 0, 10)).map((m) => `${m.year}-${m.month}`))
      .toEqual(["2026-11", "2026-12", "2027-1"]);
  });
});

describe("buildContributionGrid", () => {
  it("keeps a row for somebody who has paid nothing", () => {
    const grid = buildContributionGrid({
      months,
      contributors,
      entries: [{ contributorId: 3, amount: 1_000, month: 7, year: 2026 }],
    });

    const grace = grid.rows.find((row) => row.contributorId === 1);
    expect(grace).toBeDefined();
    expect(grace?.amounts).toEqual([0, 0, 0]);
    expect(grace?.total).toBe(0);
  });

  it("adds up instalments within one month", () => {
    const grid = buildContributionGrid({
      months,
      contributors,
      entries: [
        { contributorId: 2, amount: 400, month: 8, year: 2026 },
        { contributorId: 2, amount: 600, month: 8, year: 2026 },
      ],
    });

    expect(grid.rows.find((row) => row.contributorId === 2)?.amounts).toEqual([0, 1_000, 0]);
  });

  it("adds deposits and recorded contributions into the same cell", () => {
    // The two places money is recorded must not each show half the picture.
    const grid = buildContributionGrid({
      months,
      contributors,
      entries: [
        { contributorId: 3, amount: 500, month: 9, year: 2026 },
        { contributorId: 3, amount: "700", month: 9, year: 2026 },
      ],
    });

    expect(grid.rows.find((row) => row.contributorId === 3)?.amounts).toEqual([0, 0, 1_200]);
  });

  it("says what is still outstanding against the expected amount", () => {
    const grid = buildContributionGrid({
      months,
      contributors,
      entries: [{ contributorId: 2, amount: 400, month: 7, year: 2026 }],
    });

    const john = grid.rows.find((row) => row.contributorId === 2);
    expect(john?.outstanding).toEqual([600, 1_000, 1_000]);
  });

  it("never reports a negative outstanding for somebody who gave extra", () => {
    // Giving more than expected does not mean the group owes it back, and a
    // negative figure in that column reads as a bug.
    const grid = buildContributionGrid({
      months,
      contributors,
      entries: [{ contributorId: 1, amount: 2_500, month: 7, year: 2026 }],
    });

    expect(grid.rows.find((row) => row.contributorId === 1)?.outstanding[0]).toBe(0);
  });

  it("reports nothing outstanding where giving is voluntary", () => {
    // A church is never chasing anybody. No expected amount means no debt,
    // which is a different thing from a debt of zero.
    const grid = buildContributionGrid({
      months,
      contributors: [{ id: 9, name: "Anonymous", monthlyTarget: null }],
      entries: [],
    });

    expect(grid.rows[0].outstanding).toEqual([null, null, null]);
  });

  it("leaves an archived contributor out of the grid", () => {
    const grid = buildContributionGrid({
      months,
      contributors: [...contributors, { id: 4, name: "Departed", monthlyTarget: 1_000, archivedAt: new Date() }],
      entries: [{ contributorId: 4, amount: 5_000, month: 7, year: 2026 }],
    });

    expect(grid.rows.map((row) => row.contributorId)).not.toContain(4);
    // And their money does not silently inflate somebody else's column.
    expect(grid.columnTotals[0]).toBe(0);
  });

  it("ignores anything outside the reported months", () => {
    const grid = buildContributionGrid({
      months,
      contributors,
      entries: [
        { contributorId: 3, amount: 99_000, month: 3, year: 2026 },
        { contributorId: 3, amount: 1_000, month: 7, year: 2026 },
      ],
    });

    expect(grid.rows.find((row) => row.contributorId === 3)?.total).toBe(1_000);
  });

  it("totals each column and the whole grid", () => {
    const grid = buildContributionGrid({
      months,
      contributors,
      entries: [
        { contributorId: 1, amount: 1_000, month: 7, year: 2026 },
        { contributorId: 2, amount: 1_000, month: 7, year: 2026 },
        { contributorId: 3, amount: 500, month: 9, year: 2026 },
      ],
    });

    expect(grid.columnTotals).toEqual([2_000, 0, 500]);
    expect(grid.grandTotal).toBe(2_500);
  });

  it("orders rows by name, so the sheet reads the same every time", () => {
    const grid = buildContributionGrid({ months, contributors, entries: [] });

    expect(grid.rows.map((row) => row.name)).toEqual(["Grace Achieng", "John Kamau", "Mary Wanjiku"]);
  });
});
