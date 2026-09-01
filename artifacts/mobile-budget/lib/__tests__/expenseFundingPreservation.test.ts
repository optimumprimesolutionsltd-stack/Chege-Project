import { describe, expect, it } from 'vitest';
import {
  addFundingSourceWithRemainder,
  addIncomeSourceToSelection,
  buildSinglePayerFundingReplacement,
  getExpenseFundingControlState,
  getFundingRemainder,
  isFundingFulfilled,
  getNewExpenseCategoryMode,
  getProjectedCategoryBalance,
  preserveExpenseSplitsForAmount,
} from '../expenseFundingPreservation';

describe('expense funding preservation', () => {
  const duplicateNameSplits = [
    { userId: 'member-1', label: 'Salary', amount: 700, incomeSourceId: 11, fromBank: false },
    { userId: 'member-1', label: 'Salary', amount: 300, incomeSourceId: 29, fromBank: false },
  ];

  it('keeps every stable source id when non-funding fields are edited', () => {
    expect(preserveExpenseSplitsForAmount(duplicateNameSplits, 1000)).toEqual(duplicateNameSplits);
  });

  it('rebalances an amount change without collapsing duplicate-name sources', () => {
    expect(preserveExpenseSplitsForAmount(duplicateNameSplits, 1200)).toEqual([
      { userId: 'member-1', label: 'Salary', amount: 840, incomeSourceId: 11, fromBank: false },
      { userId: 'member-1', label: 'Salary', amount: 360, incomeSourceId: 29, fromBank: false },
    ]);
  });

  it('rejects a total too small to keep every positive split', () => {
    expect(preserveExpenseSplitsForAmount(duplicateNameSplits, 1)).toBeNull();
  });

  it('explicitly replaces mixed funding when it becomes Joint bank only', () => {
    expect(buildSinglePayerFundingReplacement({
      amount: 1200,
      paidFromBank: true,
      sources: [],
    })).toEqual([
      { userId: null, label: 'Joint bank', amount: 1200, fromBank: true },
    ]);
  });

  it('keeps the selected stable source when multiple payers become one payer', () => {
    expect(buildSinglePayerFundingReplacement({
      amount: 1200,
      paidFromBank: false,
      userId: 'member-1',
      sources: [{ incomeSourceId: 29, label: 'Salary', amount: 1200 }],
    })).toEqual([
      { userId: 'member-1', label: 'Salary', amount: 1200, incomeSourceId: 29, fromBank: false },
    ]);
  });

  it('locks personal controls for a bank-only expense until mixed funding is requested', () => {
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

  it('calculates the positive remainder for a selected primary source', () => {
    expect(getFundingRemainder(1000, 650)).toBe(350);
    expect(getFundingRemainder(1000, 1000)).toBe(0);
    expect(getFundingRemainder(1000, 1200)).toBe(0);
    expect(getFundingRemainder(1000, 0)).toBe(0);
  });

  it('marks funding fulfilled once the entered portions reach the expense total', () => {
    expect(isFundingFulfilled(1000, 999)).toBe(false);
    expect(isFundingFulfilled(1000, 1000)).toBe(true);
    expect(isFundingFulfilled(1000, 1200)).toBe(true);
    expect(isFundingFulfilled(0, 1000)).toBe(false);
  });

  it('fills a newly selected second source from the existing primary amount', () => {
    expect(addFundingSourceWithRemainder({
      total: 1000,
      selectedSourceIds: ['primary'],
      newSourceId: 'second',
      amounts: { primary: '650' },
    })).toEqual({ primary: '650', second: '350' });
  });

  it('supports either bank/direct selection order and keeps filling later remainders', () => {
    expect(addFundingSourceWithRemainder({
      total: 1000,
      selectedSourceIds: ['income:salary'],
      newSourceId: '__joint_bank__',
      amounts: { 'income:salary': '650' },
    })).toEqual({ 'income:salary': '650', '__joint_bank__': '350' });

    expect(addFundingSourceWithRemainder({
      total: 1000,
      selectedSourceIds: ['__joint_bank__'],
      newSourceId: 'income:salary',
      amounts: { '__joint_bank__': '650' },
    })).toEqual({ '__joint_bank__': '650', 'income:salary': '350' });

    expect(addFundingSourceWithRemainder({
      total: 1000,
      selectedSourceIds: ['primary', 'second'],
      newSourceId: 'third',
      amounts: { primary: '650', second: '350' },
    })).toEqual({ primary: '650', second: '350' });

    expect(addFundingSourceWithRemainder({
      total: 1000,
      selectedSourceIds: ['primary', 'second'],
      newSourceId: 'third',
      amounts: { primary: '250', second: '300' },
    })).toEqual({ primary: '250', second: '300', third: '450' });
  });

  it('does not create a positive remainder for an exact or overfunded primary', () => {
    expect(addFundingSourceWithRemainder({
      total: 1000,
      selectedSourceIds: ['primary'],
      newSourceId: 'second',
      amounts: { primary: '1000' },
    })).toEqual({ primary: '1000' });
    expect(addFundingSourceWithRemainder({
      total: 1000,
      selectedSourceIds: ['primary'],
      newSourceId: 'second',
      amounts: { primary: '1200' },
    })).toEqual({ primary: '1200' });
  });

  it('migrates the existing single-source amount before adding a new source row', () => {
    expect(addIncomeSourceToSelection({
      selectedSourceIds: [],
      amounts: {},
      existingSourceId: 7,
      existingAmount: '5000',
      newSourceId: 'source:12',
    })).toEqual({
      selectedSourceIds: ['source:7', 'source:12'],
      amounts: { 'source:7': '5000', 'source:12': '' },
    });
  });

  it('preserves already selected source amounts when adding another source', () => {
    expect(addIncomeSourceToSelection({
      selectedSourceIds: ['source:7'],
      amounts: { 'source:7': '5000' },
      existingSourceId: 7,
      existingAmount: '5000',
      newSourceId: 'source:12',
    })).toEqual({
      selectedSourceIds: ['source:7', 'source:12'],
      amounts: { 'source:7': '5000', 'source:12': '' },
    });
  });

  it('keeps a named category unbudgeted unless a manager explicitly adds it', () => {
    expect(getNewExpenseCategoryMode({ addToBudget: false, canManageCategories: true })).toBe('unbudgeted');
    expect(getNewExpenseCategoryMode({ addToBudget: true, canManageCategories: false })).toBe('unbudgeted');
    expect(getNewExpenseCategoryMode({ addToBudget: true, canManageCategories: true })).toBe('budgeted');
  });

  it('projects the category running balance after the entered allocation', () => {
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

  it('removes the saved allocation before previewing an edited expense', () => {
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
});