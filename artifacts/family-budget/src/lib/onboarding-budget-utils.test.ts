import { describe, expect, it } from "vitest";
import { getBudgetIncomeCheck, getKnownIncomeTotal } from "./onboarding-budget-utils";

describe("onboarding budget affordability", () => {
  it("totals known income streams and ignores negative amounts", () => {
    expect(getKnownIncomeTotal([
      { name: "Salary", monthlyAmount: 45000 },
      { name: "Side hustle", monthlyAmount: 12500.4 },
      { name: "Unknown", monthlyAmount: -100 },
    ])).toBe(57500);
  });

  it("warns when the plan is above known income", () => {
    expect(getBudgetIncomeCheck(60000, 50000)).toEqual({
      status: "above-income",
      message: "Your plan is KES 10,000 above the known monthly income of KES 50,000. Reduce the plan or approve it knowingly.",
    });
  });

  it("allows explicit approval when income was not provided", () => {
    expect(getBudgetIncomeCheck(30000, 0).status).toBe("no-income-provided");
    expect(getBudgetIncomeCheck(30000, 0).message).toContain("without sharing income details");
  });

  it("confirms a plan within known income", () => {
    expect(getBudgetIncomeCheck(30000, 50000).status).toBe("within-income");
  });
});
