import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dayBefore, inPeriod, nairobiToday, periodFor, summarisePeriod } from "./bank-period";

const account = {
  openingBalance: 1000,
  balance: 1000 + 500 + 200 - 300 - 100,
  transactions: [
    { type: "deposit", amount: 500, date: "2026-08-20" },
    { type: "deposit", amount: 200, date: "2026-09-05" },
    { type: "disbursement", amount: 300, date: "2026-09-10" },
    { type: "disbursement", amount: 100, date: "2026-09-25" },
  ],
};

describe("periodFor", () => {
  it("is null for all time and for an empty custom range", () => {
    expect(periodFor("all", "2026-09-24")).toBeNull();
    expect(periodFor("custom", "2026-09-24")).toBeNull();
  });
  it("covers this month up to today, last month whole, this year to today", () => {
    expect(periodFor("this-month", "2026-09-24")).toEqual({ from: "2026-09-01", to: "2026-09-24" });
    expect(periodFor("last-month", "2026-09-24")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(periodFor("last-month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(periodFor("this-year", "2026-09-24")).toEqual({ from: "2026-01-01", to: "2026-09-24" });
  });
  it("swaps a custom range given backwards and leaves an open end open", () => {
    expect(periodFor("custom", "2026-09-24", { from: "2026-09-10", to: "2026-09-01" })).toEqual({ from: "2026-09-01", to: "2026-09-10" });
    expect(periodFor("custom", "2026-09-24", { from: "2026-09-10", to: "" })?.to).toBe("9999-12-31");
  });
});

describe("dates", () => {
  it("steps back a day across month and year ends", () => {
    expect(dayBefore("2026-09-01")).toBe("2026-08-31");
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
  });
  it("reads today in Kenya, a day ahead of UTC late in the evening", () => {
    expect(nairobiToday(new Date("2026-09-24T22:30:00Z"))).toBe("2026-09-25");
  });
});

describe("summarisePeriod", () => {
  it("opens with the balance the day before, counts only the period, and closes at its end", () => {
    const summary = summarisePeriod(account, { from: "2026-09-01", to: "2026-09-30" });
    expect(summary).toEqual({ opening: 1500, closing: 1300, totalIn: 200, totalOut: 400 });
  });
  it("closes at the period's end date, ignoring later postings", () => {
    expect(summarisePeriod(account, { from: "2026-09-01", to: "2026-09-12" }).closing).toBe(1400);
  });
  it("includes both end dates", () => {
    expect(inPeriod({ date: "2026-09-10" }, { from: "2026-09-10", to: "2026-09-10" })).toBe(true);
    expect(inPeriod({ date: "2026-09-11" }, { from: "2026-09-10", to: "2026-09-10" })).toBe(false);
  });
});

describe("the bank page uses it", () => {
  const bank = readFileSync(new URL("../pages/bank.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  it("filters the list and swaps the card's figures for the period's", () => {
    expect(bank).toContain("<BankPeriodPicker");
    expect(bank).toContain("account.transactions.filter((tx) => inPeriod(tx, period))");
    expect(bank).toContain("periodSummary ? periodSummary.closing");
    expect(bank).toContain("periodSummary ? periodSummary.totalIn");
    expect(bank).toContain("periodSummary ? periodSummary.totalOut");
  });
});
