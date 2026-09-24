import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const day = readFileSync(new URL("../pages/bank-day.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

// The web "enter a whole day" page was about a third the size of the phone's.
// Reported as: "a lot is missing in enter a whole day in web app".
describe("web day of banking matches the phone", () => {
  it("carries bank charges: several per line, each its own named posting under its own category", () => {
    expect(day).toContain("type ChargeItem = { key: string; amount: string; category: string; label: string };");
    expect(day).toContain("＋ Add another charge");
    expect(day).toContain("description: charge.label.trim() || `Bank charge — ${narration}`,");
    expect(day).toContain('if (fee > 0 && !charge.category.trim()) return "Give the bank charge a category.";');
  });

  it("counts every fee in the projected balance", () => {
    expect(day).toContain("return (isOutgoing(row.kind) ? -amount : amount) - fees;");
  });

  it("remembers the charge category across sittings", () => {
    expect(day).toContain('const CHARGE_CATEGORY_KEY = "jamvi:last-charge-category";');
    expect(day).toContain("window.localStorage.setItem(CHARGE_CATEGORY_KEY, name);");
  });

  it("can record lending, with no category, and offers to raise what they owe", () => {
    expect(day).toContain('type RowKind = "spend" | "pay-party" | "money-in" | "repaid" | "borrowed" | "lend";');
    expect(day).toContain("isLending: true,");
    expect(day).toContain('if (isOutgoing(row.kind) && row.kind !== "lend" && !row.category.trim())');
    expect(day).toContain('row.kind === "lend" && party');
  });

  it("offers to pay a debt category down when spending against it", () => {
    expect(day).toContain("Spending against a debt category pays it down.");
  });

  it("makes a category, or adds someone, without leaving the page", () => {
    expect(day).toContain("useCreateBudgetCategory()");
    expect(day).toContain("＋ New category…");
    expect(day).toContain("＋ Add someone…");
    expect(day).toContain('fetch("/api/contributors", {\n        method: "POST",');
  });

  it("reads sums in amount fields and shows the result", () => {
    expect(day).toContain("evaluateAmountExpression(value)");
    expect(readFileSync(new URL("../components/amount-calc-row.tsx", import.meta.url), "utf8")).toContain("= KES ${resolved.toLocaleString()}");
  });

  it("keeps the income-source choice on money in", () => {
    expect(day).toContain('data-testid={`select-day-income-source-${index}`}');
  });
});
