import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { monthBounds } from "./month-range";

// Lag audit, 7 Oct 2026. Checked against EXTRACT in a real Postgres on 60
// month filters (date and timestamp columns, December into January): the same
// rows every time. CI has no database, so the bounds are pinned here.
describe("a month as a range the date index can answer", () => {
  it("runs from the first day to the first day of the next month", () => {
    expect(monthBounds(2026, 9)).toEqual({ from: "2026-09-01", to: "2026-10-01" });
    expect(monthBounds(2026, 12)).toEqual({ from: "2026-12-01", to: "2027-01-01" });
    expect(monthBounds(2026, 1)).toEqual({ from: "2026-01-01", to: "2026-02-01" });
  });

  it("is no month at all for one that does not exist", () => {
    expect(monthBounds(2026, 0)).toBeNull();
    expect(monthBounds(2026, 13)).toBeNull();
    expect(monthBounds(2026, 1.5)).toBeNull();
    expect(monthBounds(Number.NaN, 3)).toBeNull();
  });

  it("is how every month filter is written now", () => {
    for (const file of ["src/routes/dashboard.ts", "src/routes/ai.ts", "src/routes/expenses.ts", "src/routes/contributions.ts", "src/lib/digest.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/=\s*\$\{[^}]+\}\s+AND\s+EXTRACT\(YEAR/);
      expect(source).not.toMatch(/sql`EXTRACT\((MONTH|YEAR) FROM \$\{expensesTable\.date\}\) = \$\{/);
    }
  });
});
