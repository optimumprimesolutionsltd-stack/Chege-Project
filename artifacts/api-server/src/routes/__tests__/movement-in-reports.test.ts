import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync("src/routes/dashboard.ts", "utf8");
const reports = readFileSync("../mobile-budget/app/(tabs)/reports.tsx", "utf8");

// Money out for a debt shows as spending — a withdrawal carries a category and
// the breakdown reads it. Money in from a loan, or somebody paying you back,
// showed in nothing at all: excluded from income on purpose, and never put
// back anywhere. So a report could say you earned 40,000 and spent 95,000
// while the bank balance went up, with nothing on the page explaining it.
describe("money that is neither earned nor spent is reported", () => {
  it("counts what was borrowed", () => {
    expect(dashboard).toContain("borrowed: sql<number>");
    expect(dashboard).toContain("borrowedTotal: Number(movementRow?.borrowed ?? 0),");
  });

  it("counts what was paid back to you", () => {
    expect(dashboard).toContain("repaidToUs: sql<number>");
    expect(dashboard).toContain("repaidToUsTotal: Number(movementRow?.repaidToUs ?? 0),");
  });

  it("counts what was lent out", () => {
    expect(dashboard).toContain("lent: sql<number>");
    expect(dashboard).toContain("lentTotal: Number(movementRow?.lent ?? 0),");
  });

  it("leaves transfers between your own accounts out", () => {
    // Those are not movement of this kind; they are the same money twice.
    const block = dashboard.slice(dashboard.indexOf("const [movementRow]"), dashboard.indexOf("// Contributions ="));
    expect(block).toContain("bankTransferId} IS NULL");
  });

  it("changes none of the figures it sits beside", () => {
    // The whole point is that these are excluded from income and spending.
    // Adding them to either would undo 0038, 0040 and 0042 at once.
    expect(dashboard).toContain("const totalSpent = Math.max(0, Number(spentRow.total) + Number(categorisedDisbursementsRow.total) - businessCosts);");
  });
});

describe("the period totals carry them too", () => {
  it("reports all three", () => {
    expect(dashboard).toContain('AS borrowed_total');
    expect(dashboard).toContain('AS repaid_to_us_total');
    expect(dashboard).toContain('AS lent_total');
    expect(dashboard).toContain('borrowedTotal: numberValue("borrowedTotal"),');
    expect(dashboard).toContain('lentTotal: numberValue("lentTotal"),');
  });
});

describe("and the Reports tab says so", () => {
  it("shows them under a heading that says what they are", () => {
    expect(reports).toContain('testID="reports-not-income-not-spending"');
    expect(reports).toContain('NEITHER INCOME NOR SPENDING');
  });

  it("names each kind separately", () => {
    expect(reports).toContain('testID="reports-borrowed"');
    expect(reports).toContain('testID="reports-repaid"');
    expect(reports).toContain('testID="reports-lent"');
  });

  it("says why it is on the page at all", () => {
    expect(reports).toContain('the balance changes for reasons this page never mentions');
  });

  it("stays away when there is none of it", () => {
    // A household that neither borrows nor lends should never see this.
    expect(reports).toContain('{movedWithoutEarning > 0 ? (');
  });
});

// "What did I spend this month? KES 530,892" - stock for a side hustle counted
// as household spending on Home, when the Budget report already left it out.
describe("Home's spent and budget", () => {
  it("leave out a side hustle's costs, as the Budget report does", () => {
    expect(dashboard).toContain("const businessCosts = await incomeStreamCostLines(groupId, monthFrom, monthTo)");
    expect(dashboard).toContain("const totalBudget = sumBudget(budgetRows.filter((row) => row.reducesIncomeSourceId == null));");
  });
});

// "Can stock or any cost of goods sold be removed from here and put on its own tab?"
describe("What you spend on, household or business", () => {
  it("leaves a side hustle's costs out for household, lists only them for business, and keeps everything with no scope", () => {
    expect(dashboard).toContain('const scope = req.query.scope === "household" || req.query.scope === "business" ? req.query.scope : null;');
    expect(dashboard).toContain("bc.reduces_income_source_id IS NOT NULL AND bc.name = spending.category");
    expect(dashboard).toContain('scope === "business" ? sql`AND ${isBusinessCost}` : scope === "household" ? sql`AND NOT ${isBusinessCost}` : sql``');
  });

  it("filters the drill-down the same way as the totals", () => {
    expect(dashboard).toContain("WHERE TRUE ${scopeFilter}");
    expect(dashboard.match(/\$\{scopeFilter\}/g)).toHaveLength(2);
  });
});

// The website's Reports "Spending" for a date range counted stock.
describe("period totals", () => {
  it("take a side hustle's costs out of spending and out of money in together", () => {
    expect(dashboard).toContain("const businessCosts = await incomeStreamCostLines(groupId, start.raw, end.raw)");
    expect(dashboard).toContain('const spendingTotal = Math.max(0, numberValue("spendingTotal") - businessCosts);');
    expect(dashboard).toContain('const contributionTotal = numberValue("contributionTotal") - (numberValue("spendingTotal") - spendingTotal);');
  });
});
