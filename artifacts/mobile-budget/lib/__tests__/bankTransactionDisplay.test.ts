import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const bankScreenSource = readFileSync(
  resolve(process.cwd(), "app/(tabs)/bank.tsx"),
  "utf8",
);

describe("mobile bank transaction display", () => {
  it("shows the user-entered transaction date instead of the record creation timestamp", () => {
    expect(bankScreenSource).toContain("formatDateTime(item.date)");
    expect(bankScreenSource).not.toContain("formatDateTime(item.createdAt)");
  });

  it("shows a visible warning before an outgoing transaction makes the balance negative", () => {
    expect(bankScreenSource).toContain('testID="bank-negative-balance-warning"');
    expect(bankScreenSource).toContain("This will take the account below zero.");
    expect(bankScreenSource).toContain("getProjectedBalanceAfterOutgoing");
  });
});