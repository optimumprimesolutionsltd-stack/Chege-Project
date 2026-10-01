import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./budget.tsx", import.meta.url), "utf8");

describe("expected income on the web Budget page follows the month on screen", () => {
  it("loads what each source was expected to bring in that month", () => {
    expect(page).toContain('queryKey: ["income-sources", "budget-report", year, month],');
    expect(page).toContain("fetch(`/api/income-sources?year=${year}&month=${month}`");
  });

  it("offers this month on or this month alone when the amount changes", () => {
    expect(page).toContain('["from", `From ${monthLabel} on`, "Expected this month and every month after."],');
    expect(page).toContain('["only", `Only ${monthLabel}`, "This month alone. Every other month keeps its figure."],');
    expect(page).toContain('? reach === "only" ? { onlyThisMonth: { year, month } } : { expectedFrom: { year, month } }');
  });
});
