import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ai = readFileSync("src/routes/ai.ts", "utf8");
const dashboard = readFileSync("src/routes/dashboard.ts", "utf8");

// App review, second pass.
describe("Ask Jamvi's summary", () => {
  it("gives balances as at today, as the Bank screen does", () => {
    expect(ai).toContain("AND tx.date <= ${today}");
  });

  it("counts only real income, and bank and M-Pesa spending as spending", () => {
    expect(ai).toContain("NOT ${jointAccountTxTable.isBorrowing}");
    expect(ai).toContain("${notAReversal(jointAccountTxTable.id)}");
    expect(ai).toContain("const spent = Number(expenseTotal[0]?.total ?? 0) + Number(bankSpentRow[0]?.total ?? 0);");
  });
});

describe("a member's breakdown on Contributions", () => {
  it("counts what their card counts: not borrowing, repayments or money back", () => {
    const breakdown = dashboard.slice(dashboard.indexOf('router.get("/dashboard/member-breakdown"'), dashboard.indexOf('router.get("/dashboard/activity"'));
    expect(breakdown).toContain("AND ${jointAccountTxTable.settlesContributorId} IS NULL");
    expect(breakdown).toContain("AND NOT ${jointAccountTxTable.isBorrowing}");
    expect(breakdown).toContain("${notAReversal(jointAccountTxTable.id)}");
  });
});
