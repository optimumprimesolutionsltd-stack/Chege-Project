/**
 * The member-by-month contribution grid.
 *
 * "Who has slipped" is the question, so the cases that matter are the empty
 * ones: a member who has paid nothing must still have a row, and a month with
 * no payment must still have a cell.
 */

import { describe, expect, it } from "vitest";
import { buildContributionHistory, historyMonths } from "../contribution-history";

const months = [
  { month: 7, year: 2026, label: "Jul 2026" },
  { month: 8, year: 2026, label: "Aug 2026" },
  { month: 9, year: 2026, label: "Sep 2026" },
];

const memberships = [
  { userId: "mary", firstName: "Mary" },
  { userId: "john", firstName: "John" },
  { userId: "grace", firstName: "Grace" },
];

describe("historyMonths", () => {
  it("ends with the current month and runs oldest first", () => {
    const result = historyMonths(3, new Date(2026, 8, 15));

    expect(result.map((entry) => `${entry.year}-${entry.month}`)).toEqual([
      "2026-7",
      "2026-8",
      "2026-9",
    ]);
  });

  it("crosses a year boundary without losing a month", () => {
    const result = historyMonths(3, new Date(2027, 0, 10));

    expect(result.map((entry) => `${entry.year}-${entry.month}`)).toEqual([
      "2026-11",
      "2026-12",
      "2027-1",
    ]);
  });
});

describe("buildContributionHistory", () => {
  it("places each contribution in its own month", () => {
    const history = buildContributionHistory({
      months,
      memberships,
      expenses: [],
      contributions: [
        { userId: "mary", firstName: "Mary", amount: 12_000, month: 7, year: 2026 },
        { userId: "mary", firstName: "Mary", amount: 15_000, month: 9, year: 2026 },
      ],
    });

    const mary = history.members.find((member) => member.userId === "mary");
    expect(mary?.amounts).toEqual([12_000, 0, 15_000]);
    expect(mary?.total).toBe(27_000);
  });

  it("adds up several payments in the same month", () => {
    // Contributions arrive in instalments; the grid shows one number.
    const history = buildContributionHistory({
      months,
      memberships,
      expenses: [],
      contributions: [
        { userId: "john", firstName: "John", amount: 3_000, month: 8, year: 2026 },
        { userId: "john", firstName: "John", amount: 5_000, month: 8, year: 2026 },
      ],
    });

    expect(history.members.find((member) => member.userId === "john")?.amounts).toEqual([0, 8_000, 0]);
  });

  it("keeps a member who has paid nothing, as a row of zeroes", () => {
    const history = buildContributionHistory({
      months,
      memberships,
      expenses: [],
      contributions: [{ userId: "mary", firstName: "Mary", amount: 12_000, month: 7, year: 2026 }],
    });

    const grace = history.members.find((member) => member.userId === "grace");
    expect(grace).toBeDefined();
    expect(grace?.amounts).toEqual([0, 0, 0]);
    expect(grace?.total).toBe(0);
  });

  it("keeps a contribution from somebody who has since left the group", () => {
    // Otherwise the column totals would disagree with the rows above them.
    const history = buildContributionHistory({
      months,
      memberships,
      expenses: [],
      contributions: [{ userId: "departed", firstName: null, amount: 4_000, month: 8, year: 2026 }],
    });

    expect(history.members.find((member) => member.userId === "departed")?.name).toBe("Former member");
    expect(history.contributionTotals).toEqual([0, 4_000, 0]);
  });

  it("ignores anything outside the reported months", () => {
    const history = buildContributionHistory({
      months,
      memberships,
      expenses: [],
      contributions: [
        { userId: "mary", firstName: "Mary", amount: 99_000, month: 3, year: 2026 },
        { userId: "mary", firstName: "Mary", amount: 12_000, month: 7, year: 2026 },
      ],
    });

    expect(history.members.find((member) => member.userId === "mary")?.total).toBe(12_000);
  });

  it("totals each column across every member", () => {
    const history = buildContributionHistory({
      months,
      memberships,
      expenses: [],
      contributions: [
        { userId: "mary", firstName: "Mary", amount: 12_000, month: 7, year: 2026 },
        { userId: "john", firstName: "John", amount: 8_000, month: 7, year: 2026 },
        { userId: "grace", firstName: "Grace", amount: 5_000, month: 9, year: 2026 },
      ],
    });

    expect(history.contributionTotals).toEqual([20_000, 0, 5_000]);
  });

  it("lines expenses up with the same columns", () => {
    const history = buildContributionHistory({
      months,
      memberships,
      contributions: [],
      // Postgres hands EXTRACT back as a string; the grid must still add up.
      expenses: [
        { total: "21400", month: "7", year: "2026" },
        { total: "19750", month: "9", year: "2026" },
      ],
    });

    expect(history.expenseTotals).toEqual([21_400, 0, 19_750]);
  });

  it("puts the largest contributor first", () => {
    const history = buildContributionHistory({
      months,
      memberships,
      expenses: [],
      contributions: [
        { userId: "grace", firstName: "Grace", amount: 5_000, month: 7, year: 2026 },
        { userId: "mary", firstName: "Mary", amount: 12_000, month: 7, year: 2026 },
      ],
    });

    expect(history.members.map((member) => member.userId)).toEqual(["mary", "grace", "john"]);
  });
});
