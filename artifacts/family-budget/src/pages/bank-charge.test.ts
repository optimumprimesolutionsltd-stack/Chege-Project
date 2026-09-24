import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const bank = readFileSync(fileURLToPath(new URL("./bank.tsx", import.meta.url)), "utf8").replace(/\r\n/g, "\n");

// Reported as: "cant log bank charges too" — the web Bank form had no field for
// the bank's fee, which the phone has on every withdrawal and transfer.
describe("the web Bank form takes a bank charge", () => {
  it("offers the field on withdrawals and both kinds of transfer, not on deposits", () => {
    expect(bank).toContain('const chargeApplies = mode === "disbursement" || mode === "transfer" || mode === "bank_transfer";');
    expect(bank).toContain('data-testid="bank-charge-block"');
  });

  it("posts the fee as its own posting, linked to the withdrawal it belongs to", () => {
    expect(bank).toContain("chargeForTransactionId: parentId");
    expect(bank).toContain('description: `Bank charge — ${description.trim() || kind}`');
    expect(bank).toContain('await postBankCharge("withdrawal", createdWithdrawal.id);');
  });

  it("writes it from every branch, so a fee on a transfer is not dropped", () => {
    expect(bank.split('await postBankCharge("transfer");').length - 1).toBe(4);
    expect(bank).toContain('await postBankCharge(mode === "disbursement" ? "withdrawal" : "deposit", editingTransaction.id);');
  });

  it("checks the fee before anything is posted", () => {
    const check = bank.indexOf('title: "Where does the charge go?"');
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(bank.indexOf("await createDisbursement.mutateAsync({\n          data: {\n            amount: total"));
  });

  it("updates or removes the fee already on a posting being edited, never stacking a second", () => {
    expect(bank).toContain("await deleteTx.mutateAsync({ id: existingCharge.id });");
    expect(bank).toContain("row.chargeForTransactionId === tx.id");
  });

  it("takes the fee off the projected balance and remembers its category", () => {
    expect(bank).toContain("projectedBalanceBeforeFee - chargeToPost + (existingCharge?.amount ?? 0)");
    expect(bank).toContain("window.localStorage.setItem(CHARGE_CATEGORY_KEY");
  });
});
