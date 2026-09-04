import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const expensesSource = readFileSync(new URL("./expenses.tsx", import.meta.url), "utf8");

describe("Normal expense entry mode", () => {
  it("starts new expenses in Normal mode while keeping edits in the full editor", () => {
    expect(expensesSource).toContain('const [isAdvancedAdd, setIsAdvancedAdd] = useState(false);');
    expect(expensesSource).toContain('const isNormalAdd = mode === "add" && !isAdvancedAdd;');
    expect(expensesSource).toContain('mode === "add" && <button');
  });

  it("synchronizes Normal mode's hidden date, funding, category allocation, and recurrence fields", () => {
    expect(expensesSource).toContain("addForm.setDate(today);");
    expect(expensesSource).toContain("addForm.setIsRecurring(false);");
    expect(expensesSource).toContain("addForm.setPaidFromBank(false);");
    expect(expensesSource).toContain("addForm.setPayerIds([user.id]);");
    expect(expensesSource).toContain("addForm.setCategoryAllocations([{ category: addForm.category, amount: addForm.amount }]);");
    expect(expensesSource).toContain('addFormSources?.find((source) => source.isMain) ?? addFormSources?.[0]');
    expect(expensesSource).toContain("setAddDirectSourceAmounts(normalAddSource ? { [normalAddSource.id]: addForm.amount } : {});");
  });

  it("shows assumptions and blocks Normal saves without a source while offering Advanced", () => {
    expect(expensesSource).toContain('data-testid="normal-expense-assumptions"');
    expect(expensesSource).toContain('data-testid="normal-expense-source-blocker"');
    expect(expensesSource).toContain("Normal mode needs a saved income source");
    expect(expensesSource).toContain('data-testid="expense-advanced-mode"');
    expect(expensesSource).toContain("Normal mode records the full expense in one category.");
  });
});