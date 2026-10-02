import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HELP_SECTIONS, searchHelp } from "@/lib/help-topics";
import { summariseDebts } from "@/lib/debt-summary";
import { budgetReport } from "@/lib/budget-report";
import { budgetPlan } from "@/lib/budget-plan-rows";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../App.tsx");
const layout = read("../components/layout.tsx");

// Side-by-side check, batch 3: pages the phone had and the web did not.
describe("the web has the phone's Debt, Help, Budget plan and Budget report", () => {
  it("routes each page and lists it in the menu", () => {
    for (const path of ["/debt", "/help", "/budget-plan", "/budget-report"]) {
      expect(app).toContain(`<Route path="${path}"`);
      expect(layout).toContain(`href: '${path}'`);
    }
  });

  it("shows Debt in the menu only once there is a debt, as the phone's tab does", () => {
    expect(layout).toContain("...(hasDebt ? [{ href: '/debt'");
    expect(layout).toContain("debtParties.some((party) => typeof party.owedByUs === 'number')");
  });

  it("links the two budget reports from Reports, as the phone does", () => {
    const reports = read("./income-streams-report.tsx");
    expect(reports).toContain('href="/budget-plan"');
    expect(reports).toContain('href="/budget-report"');
  });

  it("works out debt-free dates with the phone's own sums", () => {
    const view = summariseDebts([{ id: 1, name: "Loan", debtBalance: 10_000, debtInterestRateBps: null, monthlyPayment: 2_500 }], "snowball");
    expect(view.totalOwed).toBe(10_000);
    expect(view.debtFreeOn).not.toBeNull();
    expect(read("./debt.tsx")).toContain("<DebtPayoffCard canManage />");
  });

  it("adds up the budget report and plan from the top-level rows only", () => {
    const rows = [
      { category: "Food", budgetAmount: 10_000, spentAmount: 12_000, isBudgeted: true, parentName: null },
      { category: "Groceries", budgetAmount: 10_000, spentAmount: 12_000, isBudgeted: true, parentName: "Food" },
    ];
    const report = budgetReport(rows);
    expect(report.totals.spent).toBe(12_000);
    expect(report.over.length).toBeGreaterThan(0);
    expect(budgetPlan(rows as never).householdTotal).toBe(10_000);
  });
});

describe("the web Help page", () => {
  it("only sends people to pages that exist", () => {
    const routes = HELP_SECTIONS.flatMap((section) => section.topics).map((topic) => topic.route).filter(Boolean) as string[];
    expect(routes.length).toBeGreaterThan(20);
    for (const route of routes) expect(app).toContain(`<Route path="${route}"`);
  });

  it("finds a topic by a word somebody would use", () => {
    const found = searchHelp("chama").flatMap((section) => section.topics.map((topic) => topic.question));
    expect(found).toContain("Start a group, such as a chama");
    expect(searchHelp("zzzz")).toEqual([]);
  });

  it("names buttons that are really on the web pages", () => {
    expect(read("./bank.tsx")).toContain("Money in");
    expect(read("./bank.tsx")).toContain("Create bank account");
    expect(read("./expenses.tsx")).toContain("Record Expense");
    expect(read("./savings-goals.tsx")).toContain("New Goal");
    expect(read("./my-groups.tsx")).toContain("Create or join a group");
    expect(read("./mpesa-import.tsx")).toContain("Read my statement again (keeps your choices)");
  });
});

describe("expected vs actual on the web takes exact dates, as on the phone", () => {
  it("asks the variance endpoint for the chosen days", () => {
    const card = read("../components/contribution-variance.tsx");
    expect(card).toContain("/api/contributions/variance?from=${rangeFrom}&to=${rangeTo}");
    expect(card).toContain('data-testid="variance-range-custom"');
    expect(card).toContain("enabled: isCustom,");
  });
});
