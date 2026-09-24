import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { balanceAsAt } from "./balance-as-at";

const account = {
  openingBalance: 1000,
  balance: 1600,
  transactions: [
    { type: "deposit", amount: 500, date: "2026-09-01" },
    { type: "disbursement", amount: 200, date: "2026-09-02" },
    { type: "deposit", amount: 300, date: "2026-09-05" },
  ],
};

// Changing the Date on "A day of banking" changed nothing on screen.
describe("web: the day's balance follows the date chosen", () => {
  it("counts every posting up to and including that day", () => {
    expect(balanceAsAt(account, "2026-08-31")).toBe(1000);
    expect(balanceAsAt(account, "2026-09-01")).toBe(1500);
    expect(balanceAsAt(account, "2026-09-02")).toBe(1300);
    expect(balanceAsAt(account, "2026-12-31")).toBe(1600);
  });
  it("drives the page instead of a fixed current balance", () => {
    const page = readFileSync(new URL("../pages/bank-day.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
    expect(page).toContain("const openingBalance = balanceAsAt(account as never, date);");
    expect(page).not.toContain("const openingBalance = account?.balance ?? 0;");
  });
});
