import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(new URL("./dashboard.tsx", import.meta.url), "utf8");
const cards = readFileSync(new URL("../components/dashboard-home-cards.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../components/layout.tsx", import.meta.url), "utf8");

describe("a Personal budget has what a shared group has on the web dashboard", () => {
  it("loads the breakdown and trend for any workspace", () => {
    expect(dashboard).toContain("{ query: { enabled: Boolean(group), queryKey: getGetDashboardCategoryBreakdownQueryKey({ month, year }) } },");
    expect(dashboard).toContain("{ query: { enabled: Boolean(group), queryKey: getGetDashboardTrendsQueryKey({ months: 6 }) } },");
  });

  it("warns about over-budget categories and shows top spending and the trend in Personal too", () => {
    expect(dashboard).toContain("const overBudgetCategories = (breakdown ?? []).filter((category) => category.remaining < 0);");
    expect(dashboard).toContain('"Where your money is going"');
    expect(dashboard).toContain('"Your monthly total spending"');
  });

  it("keeps group contributions for groups only", () => {
    expect(dashboard).toContain("{isSharedWorkspace ? (\n          <Card".replace(/\n/g, dashboard.includes("\r\n") ? "\r\n" : "\n"));
  });

  it("offers Reports on the home cards and names the import for statements", () => {
    expect(cards).toContain('cards.push({ icon: FileText, label: "Reports", summary: "Monthly report and funding", href: "/reports" });');
    expect(cards).not.toContain("if (isShared) {\n    cards.push({ icon: FileText");
    expect(layout).toContain("label: 'Import M-Pesa'");
  });
});
