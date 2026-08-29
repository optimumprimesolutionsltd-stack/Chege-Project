import { describe, expect, it } from 'vitest';
import {
  buildSinglePayerFundingReplacement,
  getExpenseFundingControlState,
  getNewExpenseCategoryMode,
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

  it('keeps a named category unbudgeted unless a manager explicitly adds it', () => {
    expect(getNewExpenseCategoryMode({ addToBudget: false, canManageCategories: true })).toBe('unbudgeted');
    expect(getNewExpenseCategoryMode({ addToBudget: true, canManageCategories: false })).toBe('unbudgeted');
    expect(getNewExpenseCategoryMode({ addToBudget: true, canManageCategories: true })).toBe('budgeted');
  });
});