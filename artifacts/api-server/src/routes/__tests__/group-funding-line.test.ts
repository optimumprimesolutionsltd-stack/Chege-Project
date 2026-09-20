import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/contributors.ts", "utf8");
const statement = readFileSync("src/lib/contribution-statement.ts", "utf8");
const mobile = readFileSync("../mobile-budget/components/ContributionExport.tsx", "utf8");

// A deposit with no contributor split is Shared group funding, not anyone's
// contribution, and the ledger deliberately leaves it out. Leaving it out
// *silently* is what made the report read nil in one place and show figures in
// another, with nothing connecting them.
describe("money held for the group is reported, not hidden", () => {
  it("counts the part of a deposit no contributor claimed", () => {
    expect(route).toContain('t.amount - COALESCE(SUM(s.amount), 0) AS "amount"');
    // A deposit split for only part of its value leaves the remainder here,
    // so partial attribution is not quietly lost with the unsplit ones.
    expect(route).toContain("HAVING t.amount - COALESCE(SUM(s.amount), 0) > 0");
  });

  it("looks at real deposits only, on the same terms as the ledger", () => {
    const query = route.slice(route.indexOf("FROM joint_account_transactions t"));
    expect(query.slice(0, 500)).toContain("t.type = 'deposit'");
    // No leg of a bank-to-bank transfer: moving your own money between
    // accounts funds nothing.
    expect(query.slice(0, 500)).toContain("t.bank_transfer_id IS NULL");
  });

  it("keeps it out of the grand total", () => {
    expect(statement).toContain("/** Not part of grandTotal: it is nobody's contribution. */");
    expect(statement).toContain("groupFundingTotal: number;");
  });

  it("narrows it with the range, like everything else on the statement", () => {
    // Or a dated report would show group funding from outside the period it
    // claims to cover.
    expect(statement).toContain("const groupFunding = statement.groupFunding.filter((entry) => entry.date >= from && entry.date <= to);");
  });
});

describe("and the phone says so", () => {
  it("shows it beside the contributions, not folded into them", () => {
    expect(mobile).toContain('testID="statement-group-funding"');
    expect(mobile).toContain("Held for the group: KES");
  });

  it("says whose it is not, since that is the confusing part", () => {
    expect(mobile).toContain("nobody&apos;s contribution");
  });

  it("carries it into the shared WhatsApp text too", () => {
    expect(mobile).toContain("Held for the group (nobody's contribution): ${kes(statement.groupFundingTotal)}");
  });

  it("stays quiet when there is none", () => {
    // Most groups have none, and a zero line would be noise on every report.
    expect(mobile).toContain("if (statement.groupFundingTotal) {");
    expect(mobile).toContain("{viewData.groupFundingTotal ? (");
  });
});
