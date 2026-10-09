import { describe, expect, it } from "vitest";
import { cursorOf, pageOf } from "../account-page";

// Newest first, as lib/account-ledger returns them. Two on 3 Oct, saved a minute apart.
const row = (id: number, date: string, type: "deposit" | "disbursement", amount: number, createdAt = `${date}T08:00:00.000Z`) =>
  ({ entry: { id, date, type, amount, createdAt }, sumThroughThis: 0 });
const rows = [
  row(9, "2026-10-03", "disbursement", 300, "2026-10-03T09:01:00.000Z"),
  row(8, "2026-10-03", "deposit", 1_000, "2026-10-03T09:00:00.000Z"),
  row(7, "2026-10-01", "disbursement", 50),
  row(6, "2026-09-30", "deposit", 5_000),
  row(5, "2026-09-12", "disbursement", 700),
  row(4, "2026-09-01", "disbursement", 20),
];
const ids = (list: Array<{ entry: { id: number } }>) => list.map((one) => one.entry.id);

describe("a page of an account's history", () => {
  it("is everything, as before, when no page is asked for", () => {
    const page = pageOf(rows, {});
    expect(ids(page.rows)).toEqual([9, 8, 7, 6, 5, 4]);
    expect(page.nextCursor).toBeNull();
    expect(page.month).toBeNull();
  });

  it("goes page by page, newest first, never skipping or repeating a row", () => {
    const first = pageOf(rows, { limit: 4 });
    expect(ids(first.rows)).toEqual([9, 8, 7, 6]);
    const second = pageOf(rows, { limit: 4, before: first.nextCursor! });
    expect(ids(second.rows)).toEqual([5, 4]);
    expect(second.nextCursor).toBeNull();
  });

  it("carries on after a row deleted since, by its place in the order", () => {
    const first = pageOf(rows, { limit: 2 });
    expect(first.nextCursor).toBe(cursorOf(rows[1].entry));
    const withoutIt = rows.filter((one) => one.entry.id !== 8);
    expect(ids(pageOf(withoutIt, { limit: 2, before: first.nextCursor! }).rows)).toEqual([7, 6]);
  });

  it("keeps to one month, with its money in and out", () => {
    const september = pageOf(rows, { month: 9, year: 2026 });
    expect(ids(september.rows)).toEqual([6, 5, 4]);
    expect(september.month).toEqual({ deposits: 5_000, disbursements: 720 });
  });

  it("limit 0 is the month's totals alone - Home", () => {
    const home = pageOf(rows, { month: 10, year: 2026, limit: 0 });
    expect(home.rows).toEqual([]);
    expect(home.nextCursor).toBeNull();
    expect(home.month).toEqual({ deposits: 1_000, disbursements: 350 });
  });

  it("ignores a cursor it cannot read", () => {
    expect(ids(pageOf(rows, { limit: 2, before: "nonsense" }).rows)).toEqual([9, 8]);
  });
});
