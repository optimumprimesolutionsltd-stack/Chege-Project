import { describe, expect, it } from "vitest";
import { canManageBankAccount, resolveBankAccountSelection } from "../bankAccess";

describe("bank workspace access", () => {
  it.each(["owner", "admin"] as const)(
    "lets a shared-budget %s manage withdrawals",
    (role) => {
      expect(canManageBankAccount({ isPrivate: false, role })).toBe(true);
    },
  );

  it("keeps shared-budget member withdrawals manager-only", () => {
    expect(canManageBankAccount({ isPrivate: false, role: "member" })).toBe(false);
  });

  it("keeps the selected second account instead of falling back to the first", () => {
    const accounts = [{ id: 10 }, { id: 20 }];
    expect(resolveBankAccountSelection(accounts, 20, 10)).toBe(20);
    expect(resolveBankAccountSelection(accounts, null, 20)).toBe(20);
  });
});