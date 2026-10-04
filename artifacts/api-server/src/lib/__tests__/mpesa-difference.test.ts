import { describe, expect, it } from "vitest";
import { findDifference, nextDay, type DifferenceMessage, type LedgerEntry } from "../mpesa-difference";

// A small M-Pesa history: 1,000 to start, then a payment, money in, another payment.
const at = (day: string, hour: number) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00+03:00`).getTime();
const messages: DifferenceMessage[] = [
  { receipt: "AAA0000001", balance: 700, at: at("2026-10-01", 9), day: "2026-10-01" },   // paid 300
  { receipt: "AAA0000002", balance: 2700, at: at("2026-10-02", 9), day: "2026-10-02" },  // received 2,000
  { receipt: "AAA0000003", balance: 2200, at: at("2026-10-03", 9), day: "2026-10-03" },  // paid 500
];
const right: LedgerEntry[] = [
  { id: 1, date: "2026-10-01", signed: -300, receipt: "AAA0000001", description: "Shop" },
  { id: 2, date: "2026-10-02", signed: 2000, receipt: "AAA0000002", description: "Salary" },
  { id: 3, date: "2026-10-03", signed: -500, receipt: "AAA0000003", description: "Rent" },
];

describe("find the difference", () => {
  it("finds nothing when every day agrees", () => {
    const result = findDifference(messages, right, 1000)!;
    expect(result).toMatchObject({ from: "2026-10-01", to: "2026-10-03", checkedDays: 3, startGap: 0, endGap: 0, spans: [] });
  });

  it("puts a missing starting balance before the messages begin, not on a day", () => {
    const result = findDifference(messages, right, 0)!;
    expect(result.startGap).toBe(1000);
    expect(result.endGap).toBe(1000);
    expect(result.spans).toEqual([]);
  });

  it("finds money in that this account never got, and where it was saved instead", () => {
    const ledger = right.filter((entry) => entry.id !== 2);
    const result = findDifference(messages, ledger, 1000, new Map([["AAA0000002", { account: "Equity", date: "2026-10-02" }]]))!;
    expect(result.endGap).toBe(2000);
    expect(result.spans).toHaveLength(1);
    expect(result.spans[0]).toMatchObject({
      from: "2026-10-02",
      to: "2026-10-02",
      change: 2000,
      missing: [{ receipt: "AAA0000002", day: "2026-10-02", savedIn: "Equity", savedOn: "2026-10-02" }],
      extra: [],
    });
  });

  it("finds spending counted twice: once typed by hand, once from the message", () => {
    const ledger = [...right, { id: 9, date: "2026-10-03", signed: -500, receipt: null, description: "Rent (typed)" }];
    const result = findDifference(messages, ledger, 1000)!;
    expect(result.endGap).toBe(500);
    expect(result.spans[0]).toMatchObject({
      from: "2026-10-03",
      to: "2026-10-03",
      change: 500,
      extra: [{ id: 9, date: "2026-10-03", amount: -500, description: "Rent (typed)", receipt: null }],
      missing: [],
    });
  });

  it("finds an entry saved under a different day from its message, which moves the gap and moves it back", () => {
    const ledger = right.map((entry) => (entry.id === 2 ? { ...entry, date: "2026-10-03" } : entry));
    const result = findDifference(messages, ledger, 1000)!;
    expect(result.endGap).toBe(0);
    expect(result.spans.map((span) => span.change)).toEqual([2000, -2000]);
    expect(result.spans[0].redated).toEqual([
      { id: 2, receipt: "AAA0000002", messageDay: "2026-10-02", savedDate: "2026-10-03", amount: 2000, description: "Salary" },
    ]);
  });

  it("uses each day's last message, whatever order they arrive in", () => {
    const sameDay: DifferenceMessage[] = [
      { receipt: "BBB0000002", balance: 400, at: at("2026-10-01", 15), day: "2026-10-01" },
      { receipt: "BBB0000001", balance: 900, at: at("2026-10-01", 8), day: "2026-10-01" },
    ];
    const ledger: LedgerEntry[] = [
      { id: 1, date: "2026-10-01", signed: -100, receipt: "BBB0000001", description: "a" },
      { id: 2, date: "2026-10-01", signed: -500, receipt: "BBB0000002", description: "b" },
    ];
    expect(findDifference(sameDay, ledger, 1000)).toMatchObject({ startGap: 0, endGap: 0, spans: [] });
  });

  it("has nothing to say without messages that state a balance", () => {
    expect(findDifference([], right, 0)).toBeNull();
  });

  it("counts days across a month end", () => {
    expect(nextDay("2026-09-30")).toBe("2026-10-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });
});
