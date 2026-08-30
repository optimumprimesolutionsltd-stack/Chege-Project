import { describe, expect, it } from "vitest";
import {
  addFundingSourceWithRemainder,
  getExpenseFundingControlState,
  getFundingRemainder,
  getNewExpenseCategoryMode,
  hasMissingPersonalFundingSource,
} from "./expense-funding-utils";

describe("hasMissingPersonalFundingSource", () => {
  it("requires a saved source for a single personal payer", () => {
    expect(hasMissingPersonalFundingSource({
      payerIds: ["member-1"],
      isSplitPayment: false,
      incomeSourceId: null,
      payerIncomeSourceIds: {},
    })).toBe(true);

    expect(hasMissingPersonalFundingSource({
      payerIds: ["member-1"],
      isSplitPayment: false,
      incomeSourceId: 12,
      payerIncomeSourceIds: {},
    })).toBe(false);
  });

  it("requires a distinct saved source for every personal split payer", () => {
    expect(hasMissingPersonalFundingSource({
      payerIds: ["member-1", "member-2"],
      isSplitPayment: true,
      incomeSourceId: null,
      payerIncomeSourceIds: { "member-1": 12, "member-2": null },
    })).toBe(true);

    expect(hasMissingPersonalFundingSource({
      payerIds: ["member-1", "member-2"],
      isSplitPayment: true,
      incomeSourceId: null,
      payerIncomeSourceIds: { "member-1": 12, "member-2": 14 },
    })).toBe(false);
  });
});

describe("expense funding controls", () => {
  it("locks personal controls for a bank-only expense until mixed funding is requested", () => {
    expect(getExpenseFundingControlState({
      paidFromBank: true,
      hasPersonalFunding: false,
      allowMixedFunding: false,
    })).toEqual({
      requiresBankAccount: true,
      personalPayersDisabled: true,
      showBankOnlyExplanation: true,
      showPersonalIncomeSources: false,
    });

    expect(getExpenseFundingControlState({
      paidFromBank: true,
      hasPersonalFunding: false,
      allowMixedFunding: true,
    }).personalPayersDisabled).toBe(false);

    expect(getExpenseFundingControlState({
      paidFromBank: true,
      hasPersonalFunding: true,
      allowMixedFunding: true,
    }).showPersonalIncomeSources).toBe(true);
  });

  it("calculates only a positive whole-KES remainder", () => {
    expect(getFundingRemainder(1000, 650)).toBe(350);
    expect(getFundingRemainder(1000, 1000)).toBe(0);
    expect(getFundingRemainder(1000, 1200)).toBe(0);
    expect(getFundingRemainder(1000, 0)).toBe(0);
  });

  it("fills a newly selected second source from the existing primary amount", () => {
    expect(addFundingSourceWithRemainder({
      total: 1000,
      selectedSourceIds: ["primary"],
      newSourceId: "second",
      amounts: { primary: "650" },
    })).toEqual({ primary: "650", second: "350" });
  });

  it("supports either bank/direct selection order and keeps filling later remainders", () => {
    expect(addFundingSourceWithRemainder({
      total: 1000,
      selectedSourceIds: ["income:salary"],
      newSourceId: "__joint_bank__",
      amounts: { "income:salary": "650" },
    })).toEqual({ "income:salary": "650", "__joint_bank__": "350" });

    expect(addFundingSourceWithRemainder({
      total: 1000,
      selectedSourceIds: ["__joint_bank__"],
      newSourceId: "income:salary",
      amounts: { "__joint_bank__": "650" },
    })).toEqual({ "__joint_bank__": "650", "income:salary": "350" });

    expect(addFundingSourceWithRemainder({
      total: 1000,
      selectedSourceIds: ["primary", "second"],
      newSourceId: "third",
      amounts: { primary: "650", second: "350" },
    })).toEqual({ primary: "650", second: "350" });

    expect(addFundingSourceWithRemainder({
      total: 1000,
      selectedSourceIds: ["primary", "second"],
      newSourceId: "third",
      amounts: { primary: "250", second: "300" },
    })).toEqual({ primary: "250", second: "300", third: "450" });
  });

  it("does not create a positive remainder for an exact or overfunded primary", () => {
    expect(addFundingSourceWithRemainder({
      total: 1000,
      selectedSourceIds: ["primary"],
      newSourceId: "second",
      amounts: { primary: "1000" },
    })).toEqual({ primary: "1000" });
    expect(addFundingSourceWithRemainder({
      total: 1000,
      selectedSourceIds: ["primary"],
      newSourceId: "second",
      amounts: { primary: "1200" },
    })).toEqual({ primary: "1200" });
  });

  it("keeps a named category unbudgeted unless a manager explicitly adds it", () => {
    expect(getNewExpenseCategoryMode({ addToBudget: false, canManageCategories: true })).toBe("unbudgeted");
    expect(getNewExpenseCategoryMode({ addToBudget: true, canManageCategories: false })).toBe("unbudgeted");
    expect(getNewExpenseCategoryMode({ addToBudget: true, canManageCategories: true })).toBe("budgeted");
  });
});