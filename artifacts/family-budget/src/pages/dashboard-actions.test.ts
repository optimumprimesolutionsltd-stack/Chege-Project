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

  it("keeps workspace bank funding visible for Personal budget owners", () => {
    expect(dashboardSource).toContain("canUseBankFunding={canManageBank}");
    expect(dashboardSource).toContain("const { data: bankAccounts = [] } = useGetJointAccounts();");
    expect(dashboardSource).toContain('"Paid directly"');
    expect(dashboardSource).toContain('"Personal bank deposits"');
    expect(dashboardSource).toContain('"Both"');
    expect(dashboardSource).toContain("selectedBankAccountId");
    expect(dashboardSource).toContain("Only the bank-deposit portion reduces the selected account.");
  });

  it("does not ask a Personal budget owner who paid", () => {
    expect(dashboardSource).toContain("const directPayerId = isSharedWorkspace ? paidBy : (currentUserId ?? \"\");");
    expect(dashboardSource).toContain('{isSharedWorkspace && fundingMode !== "bank" && <div className="space-y-1.5">');
    expect(dashboardSource).toContain("max={isSharedWorkspace && !canManageShared ? today : undefined}");
    expect(dashboardSource).toContain('{isSharedWorkspace && !canManageShared && <p className="text-xs text-muted-foreground">Members can record expenses for today only.</p>}');
  });
});