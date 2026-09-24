import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// Reported as: "didnt see a calculator in day of banking web app". The web
// only previewed a typed sum; the phone has calculator keys.
describe("the web day of banking has the phone's calculator", () => {
  const day = read("./bank-day.tsx");

  it("puts the calculator under every amount and every bank charge", () => {
    expect(day.split("<AmountCalcRow").length - 1).toBe(2);
    expect(day).not.toContain("<SumPreview");
  });

  it("offers the operators, delete, equals and a number pad", () => {
    const calc = read("../components/amount-calc-row.tsx");
    for (const key of ["+", "−", "×", "÷", "(", ")"]) expect(calc).toContain(`"${key}"`);
    expect(calc).toContain("-key-delete");
    expect(calc).toContain("-key-equals");
    expect(calc).toContain("-toggle-keypad");
    expect(calc).toContain("evaluateAmountExpression(value)");
  });
});
