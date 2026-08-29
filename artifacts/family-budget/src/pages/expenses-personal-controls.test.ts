import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const expensesSource = readFileSync(new URL("./expenses.tsx", import.meta.url), "utf8");

describe("Personal budget expense controls", () => {
  it("attributes direct Personal expenses to the owner without a payer picker", () => {
    expect(expensesSource).toContain("const isPersonalBudget = group?.isPrivate === true;");
    expect(expensesSource).toContain("const memberPayerId = isPersonalBudget ? user?.id");
    expect(expensesSource).toContain("{isPersonalBudget ? \"Funding source\" : \"Paid by\"}");
    expect(expensesSource).toContain("{!isPersonalBudget && (canManageExpenses ?");
  });

  it("uses Personal bank language instead of Joint-bank language", () => {
    expect(expensesSource).toContain('{isPersonalBudget ? "Personal bank account" : "Shared bank account"}');
    expect(expensesSource).toContain('label: isPersonalBudget ? "Personal bank" : "Shared bank"');
  });
});