import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { withMonthExpected } from "../income-months";

vi.mock("@workspace/db", () => ({ db: {} }));

const change = (year: number, month: number, amount: number, onlyThisMonth = false) => ({ year, month, amount, onlyThisMonth });

// "Expected monthly income still applies the same amount to every month."
describe("what a source was expected to bring in, month by month", () => {
  const sources = [{ id: 1, expectedMonthlyAmount: 120_000 }, { id: 2, expectedMonthlyAmount: 20_000 }];
  // Salary was 100,000 until October, 120,000 now; December has a one-off bonus month.
  const history = new Map([[1, [change(2026, 10, 100_000), change(2026, 12, 250_000, true)]]]);

  it("keeps what was expected before a change", () => {
    expect(withMonthExpected(sources, history, 2026, 1)[0].expectedMonthlyAmount).toBe(100_000);
    expect(withMonthExpected(sources, history, 2026, 10)[0].expectedMonthlyAmount).toBe(120_000);
  });

  it("uses a one-month figure for that month alone", () => {
    expect(withMonthExpected(sources, history, 2026, 12)[0].expectedMonthlyAmount).toBe(250_000);
    expect(withMonthExpected(sources, history, 2027, 1)[0].expectedMonthlyAmount).toBe(120_000);
  });

  it("leaves sources without history alone", () => {
    expect(withMonthExpected(sources, history, 2026, 1)[1]).toBe(sources[1]);
    expect(withMonthExpected(sources, new Map(), 2026, 1)).toEqual(sources);
  });
});

describe("expected income is read and changed by month", () => {
  const route = readFileSync("src/routes/income-sources.ts", "utf8");
  const dashboard = readFileSync("src/routes/dashboard.ts", "utf8");
  const ai = readFileSync("src/routes/ai.ts", "utf8");

  it("the income streams report and Ask Jamvi use the month's figure", () => {
    expect(dashboard).toContain("const sources = await monthExpected(groupId, await db");
    expect(ai).toContain(".then((rows) => monthExpected(groupId, rows, year, month)),");
  });

  it("the list answers for a month when asked", () => {
    expect(route).toContain("res.json(forMonth ? await monthExpected(groupId, sources, year, month) : sources);");
  });

  it("any change keeps earlier months, from this month unless told; one month can be set alone", () => {
    expect(route).toContain("await keepEarlierIncomeMonths({ groupId, sourceId: id, previous: existing.expectedMonthlyAmount, from: expectedFrom ?? nairobiMonth() });");
    expect(route).toContain("await setIncomeOnlyThisMonth({ groupId, sourceId: id, year: onlyThisMonth.year, month: onlyThisMonth.month, amount: parsed.data.expectedMonthlyAmount });");
  });

  it("creates its table after the server starts", () => {
    expect(readFileSync("src/index.ts", "utf8")).toContain("void ensureIncomeMonths();");
  });
});
