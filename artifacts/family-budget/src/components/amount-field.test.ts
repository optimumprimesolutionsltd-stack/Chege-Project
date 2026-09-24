import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (u: string) => readFileSync(fileURLToPath(new URL(u, import.meta.url)), "utf8").replace(/\r\n/g, "\n");

// The phone's Log Expense has calculator keys on the amount; the web expense
// forms took a bare number only.
describe("web expense amounts take a sum, with calculator keys", () => {
  it("the field hands the form only the answer, so nothing downstream changes", () => {
    const field = read("./amount-field.tsx");
    expect(field).toContain("onChange(answer === null ? \"\" : String(answer));");
    expect(field).toContain("<AmountCalcRow");
  });

  it.each([
    ["../pages/expenses.tsx", 2],
    ["../pages/dashboard.tsx", 2],
  ])("%s uses it for its expense amounts", (file, count) => {
    const source = read(file);
    expect(source.split("<AmountField").length - 1).toBe(count);
  });
});
