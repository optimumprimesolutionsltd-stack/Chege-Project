import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("./dashboard.tsx", import.meta.url), "utf8");

describe("dashboard quick actions", () => {
  it("keeps a responsive budget action beside the money actions", () => {
    expect(dashboardSource).toContain('data-testid="dashboard-create-budget-cta"');
    expect(dashboardSource).toContain('href="/budget"');
    expect(dashboardSource).toContain('"Create Budget"');
    expect(dashboardSource).toContain('<span className="block sm:hidden">Budget</span>');
  });

  it("attributes Personal budget goal saves to the signed-in user", () => {
    expect(dashboardSource).toContain("memberUserId={canManageShared ? undefined : user?.id}");
  });

  it("keeps category creation visible for Personal budget owners", () => {
    expect(dashboardSource).toContain("canManageCategories={canManageCategories}");
    expect(dashboardSource).toContain("{canManageCategories && (");
    expect(dashboardSource).toContain("const canManageCategories = group?.isPrivate === true || canManageShared;");
  });
});