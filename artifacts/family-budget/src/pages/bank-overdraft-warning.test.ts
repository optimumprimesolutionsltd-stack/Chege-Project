import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const bankPageSource = readFileSync(
  fileURLToPath(new URL("./bank.tsx", import.meta.url)),
  "utf8",
);
const dashboardSource = readFileSync(
  fileURLToPath(new URL("./dashboard.tsx", import.meta.url)),
  "utf8",
);

describe("web bank overdraft warning", () => {
  it("shows a visible projected-balance warning without blocking the transaction", () => {
    expect(bankPageSource).toContain('data-testid="bank-negative-balance-warning"');
    expect(bankPageSource).toContain("This will take the account below zero.");
    expect(bankPageSource).toContain("Jamvi will still save the record");
    expect(bankPageSource).toContain("getProjectedBalanceAfterPosting");
    // The warning is about money leaving. A deposit into an overdrawn account
    // also projects below zero, and "this will take the account below zero"
    // would be a lie about a posting that moves it upward.
    expect(bankPageSource).toContain("{isOutgoingTransaction && projectedBalance !== null && projectedBalance < 0 && (");
  });

  it("keeps a negative bank balance visible on the overview after the withdrawal is saved", () => {
    expect(dashboardSource).toContain('data-testid="overview-negative-bank-balance-warning"');
    expect(dashboardSource).toContain("bankAccount.balance < 0");
    expect(dashboardSource).toContain("Jamvi keeps the withdrawal recorded");
  });
});