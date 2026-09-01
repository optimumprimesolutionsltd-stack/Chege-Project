import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bankSource = readFileSync(new URL("./bank.tsx", import.meta.url), "utf8");

describe("bank account personalization", () => {
  it("opens the selected default account with editable values", () => {
    expect(bankSource).toContain("const selectedBankAccount = accounts.find");
    expect(bankSource).toContain("setAccountNameDraft(selectedBankAccount.name)");
    expect(bankSource).toContain("setAccountNumberDraft(selectedBankAccount.accountNumber ?? \"\")");
    expect(bankSource).toContain('>{isCreatingAccount ? "Add account" : "Save changes"}<');
    expect(bankSource).toContain('>Edit selected account<');
  });

  it("keeps adding a new account separate from updating the selected account", () => {
    expect(bankSource).toContain("setAddingAccount(true)");
    expect(bankSource).toContain("updateAccount.mutateAsync({ id: editingAccountId");
    expect(bankSource).toContain("createAccount.mutateAsync({ data:");
  });

  it("stores and displays the opening balance date", () => {
    expect(bankSource).toContain('data-testid="input-opening-balance-date"');
    expect(bankSource).toContain("openingBalanceDate, accountId: selectedAccountId");
    expect(bankSource).toContain("as of ${formatDate(account.openingBalanceDate)}");
  });
});