import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

// Side-by-side check, batch 2b: Spending by item and the income trend, on the web.
describe("Spending by item on the web", () => {
  const page = read("./spending-by-item.tsx");

  it("is a page, routed and in the menu", () => {
    expect(read("../App.tsx")).toContain('<Route path="/spending-by-item" component={SpendingByItem} />');
    expect(read("../components/layout.tsx")).toContain("label: 'Spending by item'");
  });

  it("takes 3, 6 or 12 months or exact dates, by item or category, household or business", () => {
    expect(page).toContain("const PRESETS = [3, 6, 12] as const;");
    expect(page).toContain('testId="spending-item-month"');
    expect(page).toContain('...(groupBy === "category" ? { groupBy } : {}),');
    expect(page).toContain('scope: hasBusiness ? scope : ("household" as const),');
  });

  it("opens an item to the expenses behind its total", () => {
    expect(page).toContain("...(openItem ? { item: openItem } : {})");
    expect(page).toContain("enabled: openItem !== null");
  });
});

describe("the income trend on the web's Reports", () => {
  it("shows each stream over the last six months", () => {
    expect(read("../components/income-trend-card.tsx")).toContain("useGetDashboardIncomeStreamsTrend(\n    { months: 6 },".replace(/\n/g, read("../components/income-trend-card.tsx").includes("\r\n") ? "\r\n" : "\n"));
    expect(read("./income-streams-report.tsx")).toContain("<IncomeTrendCard />");
  });
});
