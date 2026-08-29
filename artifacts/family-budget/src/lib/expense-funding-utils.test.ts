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

  it("keeps a named category unbudgeted unless a manager explicitly adds it", () => {
    expect(getNewExpenseCategoryMode({ addToBudget: false, canManageCategories: true })).toBe("unbudgeted");
    expect(getNewExpenseCategoryMode({ addToBudget: true, canManageCategories: false })).toBe("unbudgeted");
    expect(getNewExpenseCategoryMode({ addToBudget: true, canManageCategories: true })).toBe("budgeted");
  });
});