import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const bank = read("./bank.tsx");
const reversal = read("../components/reversal-link.tsx");
const transfer = read("../components/transfer-editor.tsx");
const parties = read("./parties.tsx");

// Side-by-side check, batch 1: fixes that could only be made on a phone.
describe("matching a reversal on the web", () => {
  it("offers same-amount payments to link, and an unlink that asks first", () => {
    expect(reversal).toContain("link.mutateAsync({ id: transaction.id, data: { originalTransactionId: originalId } })");
    expect(reversal).toContain('window.confirm("Unlink this reversal?');
    expect(reversal).toContain("if (!canManage || isLoading || !data?.available) return null;");
  });

  it("sits in the edit form for a bank entry", () => {
    expect(bank).toContain("<ReversalLink transaction={editingTransaction as never} canManage={canManageAccount} onChanged={invalidate} />");
  });
});

describe("correcting a bank-to-bank transfer on the web", () => {
  it("has its own edit button, for owners and admins", () => {
    expect(bank).toContain("{!txEditor.editing && canManageAccount && isBankTransfer && <Button");
    expect(bank).toContain("onClick={() => setEditingTransfer(tx as unknown as TransferRow)}");
  });

  it("changes both sides together, or keeps one side as ordinary money in or out", () => {
    expect(transfer).toContain("/api/joint-account/transfers/bank-to-bank/${transfer.bankTransferId}`, {\n        method: \"PUT\"".replace(/\n/g, transfer.includes("\r\n") ? "\r\n" : "\n"));
    expect(transfer).toContain("/api/joint-account/transfers/bank-to-bank/${transfer.bankTransferId}/unpair");
    expect(transfer).toContain("keepTransactionId: transfer.id, ...(isOut ? { expenseCategory: category } : {})");
  });
});

describe("working out balances from entries on the web", () => {
  it("offers the worked-out balances and applies them only when accepted", () => {
    expect(parties).toContain('fetch("/api/contributors/worked-out", { credentials: "include" })');
    expect(parties).toContain("Use these?`)) return;");
    expect(parties).toContain('data-testid="parties-work-out"');
  });
});
