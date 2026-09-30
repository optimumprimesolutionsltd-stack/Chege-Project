import { describe, expect, it } from "vitest";
import fs from "node:fs";

const reportSource = fs.readFileSync(new URL("./income-streams-report.tsx", import.meta.url), "utf8");

describe("Shared Group report month selection", () => {
  it("opens the previous month when the current month has no expenses", () => {
    expect(reportSource).toContain("(monthlySummary.data?.expenseCount ?? 0) === 0");
    expect(reportSource).toContain("(previousMonthSummary.data?.expenseCount ?? 0) > 0");
    expect(reportSource).toContain("setMonth(previousCalendarMonth.month);");
    expect(reportSource).toContain("setYear(previousCalendarMonth.year);");
  });

  it("explains the automatic month change and lets the user return", () => {
    expect(reportSource).toContain('data-testid="latest-expense-month-notice"');
    expect(reportSource).toContain("The current month has no recorded expenses yet");
    expect(reportSource).toContain("View current month");
  });
});

describe("linking a category as an income stream's cost", () => {
  it("only a manager sees the link control, matching the server's own rule", () => {
    expect(reportSource).toContain('canManageCostCategories = pdfGroup?.role === "owner" || pdfGroup?.role === "admin"');
    expect(reportSource).toContain("!unattributed && canManageCostCategories");
  });

  it("shows the sales-minus-cost breakdown, naming every linked category", () => {
    expect(reportSource).toContain("stream.costs > 0");
    expect(reportSource).toContain("sales − ");
    expect(reportSource).toContain('leafCategories.filter((category) => category.reducesIncomeSourceId === stream.incomeSourceId).map((category) => category.name).join(", ")');
    expect(reportSource).toContain('= {formatKes(stream.total)} profit');
  });

  it("toggles a category on or off a stream without touching any other category already linked to it", () => {
    expect(reportSource).toContain("const toggleCostCategory = async (");
    expect(reportSource).toContain("if (category.reducesIncomeSourceId === incomeSourceId) {");
    expect(reportSource).toContain("await applyCostCategoryChange(category.id, null);");
    expect(reportSource).toContain("await applyCostCategoryChange(category.id, incomeSourceId);");
  });

  it("invalidates both the category list and this month's income streams after a change", () => {
    expect(reportSource).toContain("getGetBudgetCategoriesQueryKey()");
    expect(reportSource).toContain("getGetDashboardIncomeStreamsQueryKey({ month, year })");
  });

  it("renders every leaf category as its own checkbox", () => {
    expect(reportSource).toContain('type="checkbox"');
    expect(reportSource).toContain("checked={checked}");
  });

  it("asks before moving a category off a different stream it already reduces", () => {
    expect(reportSource).toContain("if (category.reducesIncomeSourceId != null) {");
    expect(reportSource).toContain("window.confirm(");
    expect(reportSource).toContain("if (!confirmed) return;");
  });

  it("explains why a category with its own sub-categories is left out of the list", () => {
    expect(reportSource).toContain("Only categories without sub-categories of their own are listed");
  });

  it("surfaces the feature on the page itself, not only inside the picker", () => {
    // Nothing pointed a manager toward this until they happened to open a
    // stream and notice the picker. A manager-only line in the page's own
    // explanation means it can be found without already knowing it exists.
    expect(reportSource).toContain("Running a business through one of these? Open it below and link a cost category");
  });
});

describe("the Income vs Expenses comparison on the monthly summary", () => {
  it("calls the income figure Income, not the old jargon, paired with Expenses", () => {
    expect(reportSource).toContain('data-testid="report-open-contribution-ledger"');
    expect(reportSource).toContain('<p className="text-xs text-muted-foreground">Income</p>');
    expect(reportSource).toContain('<p className="text-xs text-muted-foreground">Expenses</p>');
  });

  it("shows a computed net figure rather than leaving the subtraction to the reader", () => {
    expect(reportSource).toContain("const netIncomeVsExpenses = (report?.totalFunding ?? 0) - progressSpent;");
    expect(reportSource).toContain('data-testid="report-net-income-vs-expenses"');
    expect(reportSource).toContain('netIncomeVsExpenses < 0 ? "text-destructive" : "text-primary"');
  });

  it("only shows the net figure once there is something to compare", () => {
    expect(reportSource).toContain("!progressLoading && !progressError && progressHasActivity && (");
  });

  it("leaves the deeper expected-vs-actual income breakdown as is", () => {
    // A different, legitimate context: paired against "Expected income", not
    // against expenses, so the old wording still reads correctly there.
    expect(reportSource).toContain('<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recorded funding</p>');
  });
});