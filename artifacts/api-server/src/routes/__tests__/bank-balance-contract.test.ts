import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const routeSource = readFileSync(
  fileURLToPath(new URL("../joint-account.ts", import.meta.url)),
  "utf8",
);

describe("bank balance contract", () => {
  it("calculates closing balance from opening balance, deposits, and disbursements", () => {
    expect(routeSource).toContain(
      "const balance = openingBalance + totalDeposits - totalDisbursements;",
    );
    expect(routeSource).toContain("closingBalance: balance");
  });

  it("keeps the existing member attribution when an ordinary disbursement edit omits madeById", () => {
    expect(routeSource).toContain(
      "madeById: requestedMadeById, description, expenseCategory, accountId",
    );
    expect(routeSource).not.toContain(
      ".set({ amount, date, madeById, description, expenseCategory, accountId })",
    );
  });
});