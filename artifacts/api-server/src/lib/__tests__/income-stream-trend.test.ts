/**
 * The stream-by-month income trend grid.
 *
 * "Is this stream slipping" is the question, so the cases that matter are the
 * empty ones: a stream that funded nothing in a given month must still show
 * 0 in that column, not vanish from it, and a stream that funded nothing
 * across the whole range must still appear as a row of zeroes.
 */

import { describe, expect, it } from "vitest";
import { buildIncomeStreamTrend } from "../income-stream-trend";

const months = [
  { month: 7, year: 2026, label: "Jul 2026" },
  { month: 8, year: 2026, label: "Aug 2026" },
  { month: 9, year: 2026, label: "Sep 2026" },
];

const sources = [
  { id: 1, name: "Ujenzi salary" },
  { id: 2, name: "Rental income" },
];

describe("buildIncomeStreamTrend", () => {
  it("places each month's funding in its own column", () => {
    const trend = buildIncomeStreamTrend({
      months,
      sources,
      rows: [
        { incomeSourceId: 1, sourceName: "Ujenzi salary", amount: 58_000, month: 7, year: 2026 },
        { incomeSourceId: 1, sourceName: "Ujenzi salary", amount: 60_000, month: 9, year: 2026 },
      ],
    });

    const stream = trend.streams.find((entry) => entry.incomeSourceId === 1);
    expect(stream?.amounts).toEqual([58_000, 0, 60_000]);
    expect(stream?.total).toBe(118_000);
  });

  it("adds up several payments in the same month", () => {
    const trend = buildIncomeStreamTrend({
      months,
      sources,
      rows: [
        { incomeSourceId: 2, sourceName: "Rental income", amount: 90_000, month: 8, year: 2026 },
        { incomeSourceId: 2, sourceName: "Rental income", amount: 60_000, month: 8, year: 2026 },
      ],
    });

    expect(trend.streams.find((entry) => entry.incomeSourceId === 2)?.amounts).toEqual([0, 150_000, 0]);
  });

  it("keeps a stream that funded nothing, as a row of zeroes", () => {
    const trend = buildIncomeStreamTrend({
      months,
      sources,
      rows: [{ incomeSourceId: 1, sourceName: "Ujenzi salary", amount: 58_000, month: 7, year: 2026 }],
    });

    const rental = trend.streams.find((entry) => entry.incomeSourceId === 2);
    expect(rental).toBeDefined();
    expect(rental?.amounts).toEqual([0, 0, 0]);
    expect(rental?.total).toBe(0);
  });

  it("groups funding with no income source under Unattributed", () => {
    const trend = buildIncomeStreamTrend({
      months,
      sources,
      rows: [{ incomeSourceId: null, sourceName: "Unattributed", amount: 5_000, month: 8, year: 2026 }],
    });

    const unattributed = trend.streams.find((entry) => entry.incomeSourceId === null);
    expect(unattributed?.sourceName).toBe("Unattributed");
    expect(unattributed?.amounts).toEqual([0, 5_000, 0]);
  });

  it("keeps funding from a source since deleted, under its recorded name", () => {
    // The same reason a former member's contributions stay in
    // buildContributionHistory: dropping it would make the totals disagree.
    const trend = buildIncomeStreamTrend({
      months,
      sources,
      rows: [{ incomeSourceId: 9, sourceName: "Old consultancy", amount: 20_000, month: 7, year: 2026 }],
    });

    const deleted = trend.streams.find((entry) => entry.incomeSourceId === 9);
    expect(deleted?.sourceName).toBe("Old consultancy");
    expect(deleted?.amounts).toEqual([20_000, 0, 0]);
  });

  it("ignores anything outside the reported months", () => {
    const trend = buildIncomeStreamTrend({
      months,
      sources,
      rows: [
        { incomeSourceId: 1, sourceName: "Ujenzi salary", amount: 99_000, month: 3, year: 2026 },
        { incomeSourceId: 1, sourceName: "Ujenzi salary", amount: 58_000, month: 7, year: 2026 },
      ],
    });

    expect(trend.streams.find((entry) => entry.incomeSourceId === 1)?.total).toBe(58_000);
  });

  it("puts the largest stream first", () => {
    const trend = buildIncomeStreamTrend({
      months,
      sources,
      rows: [
        { incomeSourceId: 1, sourceName: "Ujenzi salary", amount: 58_000, month: 7, year: 2026 },
        { incomeSourceId: 2, sourceName: "Rental income", amount: 150_000, month: 7, year: 2026 },
      ],
    });

    expect(trend.streams.map((entry) => entry.incomeSourceId)).toEqual([2, 1]);
  });

  it("reads a string amount from Postgres the same as a number", () => {
    // COALESCE(SUM(...)) comes back as a string; the grid must still add up.
    const trend = buildIncomeStreamTrend({
      months,
      sources,
      rows: [{ incomeSourceId: 1, sourceName: "Ujenzi salary", amount: "58000", month: 7, year: 2026 }],
    });

    expect(trend.streams.find((entry) => entry.incomeSourceId === 1)?.amounts).toEqual([58_000, 0, 0]);
  });
});
