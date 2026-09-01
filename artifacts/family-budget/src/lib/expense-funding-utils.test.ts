import { describe, expect, it } from "vitest";
import {
  addFundingSourceWithRemainder,
  getExpenseFundingControlState,
  getExpenseFundingStatus,
  getFundingRemainder,
  getCategoryAllocationStatus,
  getNewExpenseCategoryMode,
  getProjectedCategoryBalance,
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

  it("preserves a bank portion while adding three independent direct portions", () => {
    const bankKey = "__joint_bank__";
    let amounts = addFundingSourceWithRemainder({
      total: 9000,
      selectedSourceIds: [bankKey],
      newSourceId: "salary",
      amounts: { [bankKey]: "1000" },
    });
    amounts.salary = "2000";
    amounts = addFundingSourceWithRemainder({
      total: 9000,
      selectedSourceIds: [bankKey, "salary"],
      newSourceId: "business",
      amounts,
    });
    amounts.business = "3000";
    amounts = addFundingSourceWithRemainder({
      total: 9000,
      selectedSourceIds: [bankKey, "salary", "business"],
      newSourceId: "freelance",
      amounts,
    });

    expect(amounts).toEqual({
      [bankKey]: "1000",
      salary: "2000",
      business: "3000",
      freelance: "3000",
    });
  });

  it("fills bank funding from the remaining balance after direct funding", () => {
    expect(getFundingRemainder(9000, 5900)).toBe(3100);
    expect(getFundingRemainder(9000, 9000)).toBe(0);
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

  it("projects the category balance after a new expense allocation", () => {
    expect(getProjectedCategoryBalance({
      budgetAmount: 10_000,
      spentAmount: 4_000,
      allocationAmount: 2_500,
    })).toEqual({
      projectedSpent: 6_500,
      remaining: 3_500,
      overBy: 0,
      isOverBudget: false,
    });
  });

  it("replaces the previous allocation when previewing an edited expense", () => {
    expect(getProjectedCategoryBalance({
      budgetAmount: 10_000,
      spentAmount: 9_000,
      previousAllocationAmount: 2_000,
      allocationAmount: 4_000,
    })).toEqual({
      projectedSpent: 11_000,
      remaining: 0,
      overBy: 1_000,
      isOverBudget: true,
    });
  });

  it("does not mark an amount-only category row ready before a category is selected", () => {
    expect(getCategoryAllocationStatus({
      total: 1000,
      allocations: [{ category: "", amount: 1000 }],
      formatAmount: String,
    })).toEqual({
      tone: "attention",
      message: "Choose a category for every row",
    });
  });

  it("shows the pending balance after the first category amount is entered", () => {
    expect(getCategoryAllocationStatus({
      total: 10000,
      allocations: [
        { category: "Education", amount: 5000 },
        { category: "Utilities", amount: Number.NaN },
      ],
      formatAmount: (amount) => `KES ${amount.toLocaleString()}`,
    })).toEqual({
      tone: "error",
      message: "Allocated KES 5,000 of KES 10,000 · KES 5,000 remaining",
    });
  });

  it("does not mark bank funding ready before an account is selected", () => {
    expect(getExpenseFundingStatus({
      total: 1000,
      fundingTotal: 1000,
      hasBankFunding: true,
      hasBankAccount: false,
      hasDirectFunding: false,
      hasDirectPayer: false,
      hasDirectIncomeSource: false,
      formatAmount: String,
    })).toEqual({
      tone: "attention",
      message: "Choose the bank account used for this expense",
    });
  });

  it("does not mark direct funding ready before its payer and income source are selected", () => {
    expect(getExpenseFundingStatus({
      total: 1000,
      fundingTotal: 1000,
      hasBankFunding: false,
      hasBankAccount: false,
      hasDirectFunding: true,
      hasDirectPayer: true,
      hasDirectIncomeSource: false,
      formatAmount: String,
    })).toEqual({
      tone: "attention",
      message: "Choose an income source for every direct portion",
    });
  });

  it("shows the live balance after the first funding amount and only marks the exact final total fully funded", () => {
    expect(getExpenseFundingStatus({
      total: 10000,
      fundingTotal: 4000,
      hasBankFunding: false,
      hasBankAccount: false,
      hasDirectFunding: true,
      hasDirectPayer: true,
      hasDirectIncomeSource: true,
      formatAmount: (amount) => `KES ${amount.toLocaleString()}`,
    })).toEqual({
      tone: "attention",
      message: "Funded KES 4,000 of KES 10,000 · KES 6,000 remaining",
    });

    expect(getExpenseFundingStatus({
      total: 10000,
      fundingTotal: 10000,
      hasBankFunding: false,
      hasBankAccount: false,
      hasDirectFunding: true,
      hasDirectPayer: true,
      hasDirectIncomeSource: true,
      formatAmount: (amount) => `KES ${amount.toLocaleString()}`,
    })).toEqual({
      tone: "ready",
      message: "Funded KES 10,000 of KES 10,000 · Fully funded",
    });
  });
});