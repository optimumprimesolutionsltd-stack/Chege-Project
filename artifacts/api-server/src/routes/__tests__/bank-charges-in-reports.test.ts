import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync("src/routes/dashboard.ts", "utf8");
const reports = readFileSync("../mobile-budget/app/(tabs)/reports.tsx", "utf8");

// A bank charge is money genuinely gone, but it is not household spending and
// belongs to no category — so it was excluded from every spending figure, and
// the only way to see a month's fees was to open the banking screen and look.
describe("bank charges reach the report", () => {
  it("counts only charges, in the period asked for", () => {
    expect(dashboard).toContain("AND ${jointAccountTxTable.bankCharge} = true");
    const query = dashboard.slice(dashboard.indexOf("AND ${jointAccountTxTable.bankCharge} = true"));
    expect(query.slice(0, 300)).toContain("EXTRACT(MONTH FROM ${jointAccountTxTable.date}) = ${month}");
  });

  it("stays outside totalSpent", () => {
    // Adding it would inflate every budget comparison by whatever the bank
    // happened to levy, against a budget that never included fees.
    expect(dashboard).toContain("bankChargesTotal: Number(bankChargesRow?.total ?? 0),");
    expect(dashboard).toContain("remaining: totalBudget - totalSpent,");
  });

  it("reports how many, not only how much", () => {
    // One 2,600 fee and twenty small ones are different problems.
    expect(dashboard).toContain("bankChargesCount: Number(bankChargesRow?.count ?? 0),");
  });
});

describe("and the report says what it is", () => {
  it("names it without calling it spending", () => {
    expect(reports).toContain('testID="report-bank-charges"');
    expect(reports).toContain("That is not counted as spending, because it belongs to no category.");
  });

  it("stays quiet when the bank took nothing", () => {
    // Most months have no fees, and a zero line every month is noise.
    expect(reports).toContain("bankCharges > 0 ?");
  });

  it("reads the figure rather than deriving a second one", () => {
    expect(reports).toContain("const bankCharges  = summary?.bankChargesTotal ?? 0;");
    expect(reports).not.toContain("bankCharge === true");
  });
});

const webDashboard = readFileSync("../family-budget/src/pages/dashboard.tsx", "utf8");

// Two surfaces read the same summary. A figure that appears on one and not the
// other is a figure somebody will argue about.
describe("the web dashboard says the same thing", () => {
  it("shows it, worded the same way", () => {
    expect(webDashboard).toContain('data-testid="dashboard-bank-charges"');
    expect(webDashboard).toContain(". That is not counted as spending, because it belongs to no category.");
  });

  it("keeps it out of Total Spent there too", () => {
    const hero = webDashboard.slice(webDashboard.indexOf('data-testid="dashboard-summary-spent"'));
    expect(hero.slice(0, 400)).toContain("{formatKes(summary.totalSpent)}");
    expect(hero.slice(0, 400)).not.toContain("bankCharges");
  });

  it("stays quiet when the bank took nothing", () => {
    expect(webDashboard).toContain("{(summary.bankChargesTotal ?? 0) > 0 ? (");
  });
});
