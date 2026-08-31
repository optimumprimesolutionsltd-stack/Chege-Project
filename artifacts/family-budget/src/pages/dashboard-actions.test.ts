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
    expect(dashboardSource).toContain("{canManageCategories && !isOtherCategory && (");
    expect(dashboardSource).toContain("const canManageCategories = group?.isPrivate === true || canManageShared;");
  });

  it("keeps workspace bank funding visible for Personal budget owners", () => {
    expect(dashboardSource).toContain("canUseBankFunding={canManageBank}");
    expect(dashboardSource).toContain("const { data: bankAccounts = [] } = useGetJointAccounts();");
    expect(dashboardSource).toContain('"Paid directly"');
    expect(dashboardSource).toContain('const bankLabel = "Bank account";');
    expect(dashboardSource).not.toContain('["mixed", "Both"');
    expect(dashboardSource).toContain("selectedBankAccountId");
    expect(expenseFormSource).toContain("setIncomeSourceId(null);");
    expect(expenseFormSource).toContain("setBankPortion(amount);");
  });

  it("does not ask a Personal budget owner who paid", () => {
    expect(expenseFormSource).toContain("const directPayerId = isSharedWorkspace ? paidBy : (currentUserId ?? \"\");");
    expect(expenseFormSource).toContain("{isSharedWorkspace && (!paidFromBank || allowMixedFunding)");
    expect(expenseFormSource).toContain("max={isSharedWorkspace && !canManageShared ? today : undefined}");
    expect(expenseFormSource).toContain('{isSharedWorkspace && !canManageShared && <p className="text-xs text-muted-foreground">Members can record expenses for today only.</p>}');
  });

  it("keeps the payer selector and named bank accounts available in Shared quick log", () => {
    expect(expenseFormSource).toMatch(
      /\{isSharedWorkspace && \(!paidFromBank \|\| allowMixedFunding\) && \([\s\S]*?Who paid\?/,
    );
    expect(expenseFormSource).toContain("Financed by");
    expect(expenseFormSource).toContain('mode === "direct" && (!paidFromBank || allowMixedFunding)');
    expect(expenseFormSource).toContain('const bankLabel = "Bank account";');
    expect(expenseFormSource).toContain('bankAccounts.find((account) => account.id === selectedBankAccountId)?.name ?? "Bank account"');
    expect(expenseFormSource).not.toContain('canManageShared && fundingMode !== "bank"');
  });

  it("keeps an existing direct portion when a new income source is created for the remainder", () => {
    expect(expenseFormSource).toContain("setAdditionalDirectPortions((previous) => [");
    expect(expenseFormSource).toContain("shouldAddAsAnotherPortion");
    expect(expenseFormSource).toContain("was added with the remaining");
    expect(expenseFormSource).toContain("additionalDirectPortions.map");
    expect(expenseFormSource).not.toContain("additionalDirectPortions.length >= 2");
  });

  it("sends recurring quick expenses to Budget and restores the draft afterward", () => {
    expect(expenseFormSource).toContain('RECURRING_DASHBOARD_DRAFT_KEY');
    expect(expenseFormSource).toContain('returnTo=dashboard');
    expect(expenseFormSource).toContain('recurringSetup=1');
    expect(expenseFormSource).toContain('params.get("resumeRecurring") !== "1"');
    expect(expenseFormSource).toContain('setRecurringMonthlyBudget(draft.recurringMonthlyBudget ?? "")');
    expect(expenseFormSource).toContain('Jamvi will take you to Budget to ask for the average monthly amount.');
  });
});