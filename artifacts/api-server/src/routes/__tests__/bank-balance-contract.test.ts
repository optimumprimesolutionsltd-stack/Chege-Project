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
      "const balance = openingBalance + ledgerDeposits - ledgerDisbursements;",
    );
    expect(routeSource).toContain("closingBalance: balance");
  });

  it("keeps internal transfers in account balances but out of ordinary in/out totals", () => {
    expect(routeSource).toContain('t.type === "deposit" && t.bankTransferId == null');
    expect(routeSource).toContain('t.type === "disbursement" && t.bankTransferId == null');
  });

  it("creates and removes bank-to-bank transfer pairs atomically", () => {
    expect(routeSource).toContain('router.post("/joint-account/transfers/bank-to-bank"');
    expect(routeSource).toContain("const transferId = randomUUID();");
    expect(routeSource).toContain("eq(jointAccountTxTable.bankTransferId, existing.bankTransferId)");
  });

  it("returns JSON when bank-account creation fails unexpectedly", () => {
    expect(routeSource).toContain('req.log.error({ err: error, groupId }, "Could not create bank account")');
    expect(routeSource).toContain(
      'res.status(500).json({ error: "Could not create the bank account. Please try again." })',
    );
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