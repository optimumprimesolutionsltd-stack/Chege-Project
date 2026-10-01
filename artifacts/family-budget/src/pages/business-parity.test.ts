import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("./business.tsx");

// Side-by-side check, batch 2c: the phone's Business report, on the web.
describe("the Business report on the web", () => {
  it("is routed, and in the menu once a category is a side hustle's cost", () => {
    expect(read("../App.tsx")).toContain('<Route path="/business" component={Business} />');
    const layout = read("../components/layout.tsx");
    expect(layout).toContain("const hasBusiness = navCategories.some((category) => category.reducesIncomeSourceId != null);");
    expect(layout).toContain("...(hasBusiness ? [{ href: '/business', label: 'Business', icon: BarChart3 }] : []),");
  });

  it("lays out sales, cost of goods sold, gross profit, expenses and net profit per business, month by month", () => {
    expect(page).toContain('"Cost of goods sold", business.costOfGoodsSold');
    expect(page).toContain('figure("= Gross profit", business.grossProfit, true');
    expect(page).toContain('figure("= Net profit", business.netProfit, true');
    expect(page).toContain("disabled={isCurrentMonth}");
  });

  it("asks for details only when shown, and matches reversed stock payments on opening", () => {
    expect(page).toContain("...(detailed.size > 0 ? { detail: true } : {})");
    expect(page).toContain("autoLinkReversals()");
  });
});
