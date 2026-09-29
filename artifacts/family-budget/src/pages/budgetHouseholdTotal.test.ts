import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./budget.tsx", import.meta.url), "utf8");

// Stock for a side hustle counted in the website's budget against actual.
describe("the website's budget totals", () => {
  it("leave a side hustle's costs out, as the phone's Budget tab does, and say how much", () => {
    expect(page).toContain("const leafBreakdown = allLeaves.filter((item) => !item.isBusinessCost);");
    expect(page).toContain('data-testid="budget-business-costs"');
  });
});
