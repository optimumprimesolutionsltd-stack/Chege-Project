import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("./dashboard.tsx", import.meta.url), "utf8");
const expenseFormSource = dashboardSource.slice(
  dashboardSource.indexOf("function ExpenseForm("),
  dashboardSource.indexOf("export default function Dashboard"),
);

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
    expect(dashboardSource).not.toContain('["mixed", "Both"');
    expect(dashboardSource).toContain("selectedBankAccountId");
    expect(expenseFormSource).toContain("setIncomeSourceId(null);");
    expect(expenseFormSource).toContain("setBankPortion(amount);");
  });

  it("does not ask a Personal budget owner who paid", () => {
    expect(expenseFormSource).toContain("const directPayerId = isSharedWorkspace ? paidBy : (currentUserId ?? \"\");");
    expect(expenseFormSource).toContain("{isSharedWorkspace && !paidFromBank");
    expect(expenseFormSource).toContain("max={isSharedWorkspace && !canManageShared ? today : undefined}");
    expect(expenseFormSource).toContain('{isSharedWorkspace && !canManageShared && <p className="text-xs text-muted-foreground">Members can record expenses for today only.</p>}');
  });

  it("keeps the payer selector and Shared bank variant available only in Shared quick log", () => {
    expect(expenseFormSource).toMatch(
      /\{isSharedWorkspace && !paidFromBank && <div className="space-y-1\.5">[\s\S]*?Paid by/,
    );
    expect(expenseFormSource).toContain("{!paidFromBank && (");
    expect(expenseFormSource).toContain("Financed by");
    expect(expenseFormSource).toContain('const bankLabel = isSharedWorkspace ? "Shared bank deposits" : "Personal bank deposits";');
    expect(expenseFormSource).toContain('label: isSharedWorkspace ? "Shared bank" : "Personal bank"');
    expect(expenseFormSource).not.toContain('canManageShared && fundingMode !== "bank"');
  });
});