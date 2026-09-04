import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("./dashboard.tsx", import.meta.url), "utf8");

describe("dashboard expense removal", () => {
  it("offers a direct remove action on recent expense rows", () => {
    expect(dashboardSource).toContain("onRemove?: () => void;");
    expect(dashboardSource).toContain("aria-label={`Remove ${item.description}`}");
    expect(dashboardSource).toContain("canManageExpenses");
    expect(dashboardSource).toContain("getActivityRecordTarget(item)?.target === \"expense\"");
  });

  it("confirms whole-expense removal and refreshes dashboard data", () => {
    expect(dashboardSource).toContain('const budgetName = group?.isPrivate ? "Personal budget" : group ? workspaceLabel(group) : "Shared budget";');
    expect(dashboardSource).toContain('Remove this expense from "${budgetName}"?');
    expect(dashboardSource).toContain('activity in "${budgetName}" will be removed.');
    expect(dashboardSource).toContain("await deleteExpense.mutateAsync({ id: deleteTarget.id });");
    expect(dashboardSource).toContain("getGetDashboardCategoryBreakdownQueryKey()");
    expect(dashboardSource).toContain("getGetDashboardTrendsQueryKey({ months: 6 })");
  });
});