/**
 * Unit tests for the contributorTotals helper
 * (artifacts/mobile-budget/utils/contributorTotals.ts)
 *
 * These tests import and exercise the *actual* exported functions used by
 * goals.tsx so that any regression in the real implementation is caught here.
 *
 * Core invariants verified:
 *   1. Manual-adjustment rows (note === MANUAL_ADJUSTMENT_NOTE) are excluded
 *      from every contributor's total, no matter who triggered the correction.
 *   2. A contributor whose only rows are manual adjustments does not appear in
 *      the summary strip at all.
 *   3. Date-range narrowing (filterStart / filterEnd) still gives the correct
 *      per-person total while continuing to exclude adjustment rows.
 *   4. The strip is omitted (empty array) when fewer than 2 real contributors
 *      exist.
 */

import { describe, it, expect } from "vitest";
import {
  deriveContributorTotals,
  applyDateFilter,
  MANUAL_ADJUSTMENT_NOTE,
} from "../contributorTotals.js";
import type { ContributionRow } from "../contributorTotals.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function row(
  opts: Partial<ContributionRow> & { amount: number; contributorName: string },
): ContributionRow {
  return {
    note: null,
    createdAt: "2024-03-01T10:00:00Z",
    ...opts,
  };
}

function adjustment(
  opts: Partial<ContributionRow> & { amount: number; contributorName: string },
): ContributionRow {
  return row({ note: MANUAL_ADJUSTMENT_NOTE, ...opts });
}

// ---------------------------------------------------------------------------
// 1. Manual-adjustment exclusion
// ---------------------------------------------------------------------------
describe("deriveContributorTotals — manual adjustment exclusion", () => {
  it("excludes a manual-adjustment row from the responsible contributor's total", () => {
    const contributions: ContributionRow[] = [
      row({ amount: 1000, contributorName: "Alice", createdAt: "2024-03-01T10:00:00Z" }),
      row({ amount: 500, contributorName: "Bob", createdAt: "2024-03-02T10:00:00Z" }),
      // Alice triggers a balance correction; this must NOT inflate her total.
      adjustment({ amount: -200, contributorName: "Alice", createdAt: "2024-03-03T10:00:00Z" }),
    ];

    const totals = deriveContributorTotals(contributions);

    const alice = totals.find((t) => t.name === "Alice");
    const bob = totals.find((t) => t.name === "Bob");

    // Alice: 1000 only — the -200 adjustment is excluded.
    expect(alice?.total).toBe(1000);
    expect(bob?.total).toBe(500);
  });

  it("does not count a positive manual-adjustment row toward any contributor's total", () => {
    const contributions: ContributionRow[] = [
      row({ amount: 2000, contributorName: "Carol", createdAt: "2024-04-01T08:00:00Z" }),
      row({ amount: 3000, contributorName: "Dave", createdAt: "2024-04-02T08:00:00Z" }),
      // Large positive adjustment — must be invisible in totals.
      adjustment({ amount: 99999, contributorName: "Dave", createdAt: "2024-04-03T08:00:00Z" }),
    ];

    const totals = deriveContributorTotals(contributions);
    const grandTotal = totals.reduce((s, t) => s + t.total, 0);

    // 2000 + 3000 = 5000; the 99999 adjustment must be excluded.
    expect(grandTotal).toBe(5000);
  });

  it("excludes a contributor whose only rows are manual adjustments", () => {
    const contributions: ContributionRow[] = [
      row({ amount: 1000, contributorName: "Eve", createdAt: "2024-05-01T08:00:00Z" }),
      row({ amount: 500, contributorName: "Frank", createdAt: "2024-05-02T08:00:00Z" }),
      // "System" only ever records adjustments — must not appear in the strip.
      adjustment({ amount: -100, contributorName: "System", createdAt: "2024-05-03T08:00:00Z" }),
    ];

    const totals = deriveContributorTotals(contributions);
    const names = totals.map((t) => t.name);

    expect(names).not.toContain("System");
    expect(names).toContain("Eve");
    expect(names).toContain("Frank");
  });

  it("returns an empty array when the only real contributor is one person (strip requires ≥ 2)", () => {
    const contributions: ContributionRow[] = [
      row({ amount: 1000, contributorName: "Alice", createdAt: "2024-05-01T08:00:00Z" }),
      adjustment({ amount: -200, contributorName: "Alice", createdAt: "2024-05-02T08:00:00Z" }),
    ];

    // Only "Alice" is a real contributor → showContributorFilter = false.
    expect(deriveContributorTotals(contributions)).toHaveLength(0);
  });

  it("returns an empty array when every row is a manual adjustment", () => {
    const contributions: ContributionRow[] = [
      adjustment({ amount: 500, contributorName: "Alice", createdAt: "2024-05-01T08:00:00Z" }),
      adjustment({ amount: 500, contributorName: "Bob", createdAt: "2024-05-02T08:00:00Z" }),
    ];

    // No real contributor rows → uniqueContributors is empty → empty array.
    expect(deriveContributorTotals(contributions)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Date-filter narrowing combined with manual-adjustment exclusion
// ---------------------------------------------------------------------------
describe("deriveContributorTotals — date-filter narrowing", () => {
  /**
   * Fixture: two contributors with real contributions in January and February,
   * plus a manual-adjustment row in February.
   */
  const contributions: ContributionRow[] = [
    // January
    row({ amount: 500, contributorName: "Alice", createdAt: "2024-01-10T10:00:00Z" }),
    row({ amount: 300, contributorName: "Bob", createdAt: "2024-01-15T10:00:00Z" }),
    // February — real contributions
    row({ amount: 700, contributorName: "Alice", createdAt: "2024-02-05T10:00:00Z" }),
    row({ amount: 400, contributorName: "Bob", createdAt: "2024-02-20T10:00:00Z" }),
    // February — manual adjustment; must be excluded regardless of date filter.
    adjustment({ amount: -600, contributorName: "Alice", createdAt: "2024-02-12T10:00:00Z" }),
  ];

  it("gives correct per-person totals across the full range, excluding the adjustment", () => {
    const totals = deriveContributorTotals(contributions);

    const alice = totals.find((t) => t.name === "Alice");
    const bob = totals.find((t) => t.name === "Bob");

    // Alice: 500 + 700 = 1200 (the -600 adjustment is excluded).
    expect(alice?.total).toBe(1200);
    expect(bob?.total).toBe(700);
  });

  it("gives correct totals narrowed to January only", () => {
    const totals = deriveContributorTotals(contributions, "2024-01-01", "2024-01-31");

    const alice = totals.find((t) => t.name === "Alice");
    const bob = totals.find((t) => t.name === "Bob");

    expect(alice?.total).toBe(500);
    expect(bob?.total).toBe(300);
  });

  it("gives correct totals narrowed to February only — adjustment still excluded", () => {
    const totals = deriveContributorTotals(contributions, "2024-02-01", "2024-02-29");

    const alice = totals.find((t) => t.name === "Alice");
    const bob = totals.find((t) => t.name === "Bob");

    // Feb real: Alice 700, Bob 400 — the -600 adjustment is in Feb but excluded.
    expect(alice?.total).toBe(700);
    expect(bob?.total).toBe(400);
  });

  it("excludes contributions before filterStart", () => {
    const totals = deriveContributorTotals(contributions, "2024-02-01", null);

    expect(totals.find((t) => t.name === "Alice")?.total).toBe(700);
    expect(totals.find((t) => t.name === "Bob")?.total).toBe(400);
  });

  it("excludes contributions after filterEnd", () => {
    const totals = deriveContributorTotals(contributions, null, "2024-01-31");

    expect(totals.find((t) => t.name === "Alice")?.total).toBe(500);
    expect(totals.find((t) => t.name === "Bob")?.total).toBe(300);
  });

  it("returns zero totals (not missing entries) when date filter removes all real contributions for a person", () => {
    // filterStart after all Feb contributions → no qualifying rows for either person.
    const totals = deriveContributorTotals(contributions, "2024-02-21", null);

    // Both contributors are still in the strip (they exist in the full list),
    // but neither has any qualifying contribution in the window.
    expect(totals.find((t) => t.name === "Alice")?.total).toBe(0);
    expect(totals.find((t) => t.name === "Bob")?.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. applyDateFilter — independent date-range tests
// ---------------------------------------------------------------------------
describe("applyDateFilter", () => {
  const rows: ContributionRow[] = [
    row({ amount: 100, contributorName: "A", createdAt: "2024-01-10T00:00:00Z" }),
    row({ amount: 200, contributorName: "A", createdAt: "2024-02-15T12:00:00Z" }),
    row({ amount: 300, contributorName: "A", createdAt: "2024-03-20T23:59:59Z" }),
  ];

  it("returns all rows when no bounds are given", () => {
    expect(applyDateFilter(rows)).toHaveLength(3);
  });

  it("keeps rows on the same day as filterStart (inclusive start boundary)", () => {
    const result = applyDateFilter(rows, "2024-02-15", null);
    expect(result.map((r) => r.amount)).toEqual([200, 300]);
  });

  it("keeps rows on the same day as filterEnd (inclusive end boundary)", () => {
    const result = applyDateFilter(rows, null, "2024-02-15");
    expect(result.map((r) => r.amount)).toEqual([100, 200]);
  });

  it("keeps only rows within the date range when both bounds are given", () => {
    const result = applyDateFilter(rows, "2024-02-01", "2024-02-28");
    expect(result.map((r) => r.amount)).toEqual([200]);
  });

  it("returns empty array when no rows fall in the range", () => {
    const result = applyDateFilter(rows, "2024-04-01", "2024-04-30");
    expect(result).toHaveLength(0);
  });
});
