/**
 * The expense form's rules, which used to live as twenty-five sequential
 * early returns inside a three-thousand-line screen.
 *
 * The point of the change is that a half-filled form reports everything at
 * once instead of one fault per tap, so the tests that matter most are the
 * ones with several faults at the same time - that behaviour did not exist
 * before and has nothing older to fall back on.
 */

import { describe, expect, it } from 'vitest';
import {
  collectExpenseProblems,
  describeProblems,
  normalizeAllocations,
  parseExpenseAmount,
  type ExpenseValidationInput,
} from '../expenseValidation';

/** A form that saves cleanly. Each test breaks exactly what it is about. */
function validForm(overrides: Partial<ExpenseValidationInput> = {}): ExpenseValidationInput {
  return {
    amount: '1000',
    description: 'Matatu fare',
    notes: '',
    date: '2026-09-11',
    todayIso: '2026-09-11',
    isAdvanced: false,
    isEditMode: false,
    category: 'Transport',
    hasNormalIncomeSource: true,
    categoryAllocations: [],
    isRecurring: false,
    recurringMonthlyBudget: '',
    payerIds: ['user-1'],
    payerAmounts: {},
    payerIncomeSourceIds: { 'user-1': 3 },
    paidFromBank: false,
    selectedBankAccountId: null,
    selectedSources: ['source-3'],
    splitAmounts: { 'source-3': '1000' },
    fundingDirty: true,
    skipFundingChecks: false,
    ...overrides,
  };
}

const fields = (input: ExpenseValidationInput) =>
  collectExpenseProblems(input).map((problem) => problem.field);

describe('a form with nothing wrong', () => {
  it('reports no problems', () => {
    expect(collectExpenseProblems(validForm())).toEqual([]);
  });
});

describe('one fault at a time', () => {
  it('catches a missing amount', () => {
    expect(fields(validForm({ amount: '' }))).toContain('amount');
  });

  it('catches a zero or negative amount', () => {
    expect(fields(validForm({ amount: '0' }))).toContain('amount');
    expect(fields(validForm({ amount: '-5' }))).toContain('amount');
  });

  it('reads thousands separators as part of the number', () => {
    expect(parseExpenseAmount('12,500')).toBe(12500);
    const form = validForm({ amount: '12,500', splitAmounts: { 'source-3': '12500' } });
    expect(collectExpenseProblems(form)).toEqual([]);
  });

  it('catches a missing description', () => {
    expect(fields(validForm({ description: '   ' }))).toContain('description');
  });

  it('catches a missing category only in simple mode', () => {
    expect(fields(validForm({ category: '' }))).toContain('category');
    expect(fields(validForm({ category: '', isAdvanced: true }))).not.toContain('category');
    expect(fields(validForm({ category: '', isEditMode: true }))).not.toContain('category');
  });

  it('requires a note when a category is "Other"', () => {
    const form = validForm({
      categoryAllocations: [{ category: 'Other', amount: '1000' }],
      notes: 'x',
    });
    expect(fields(form)).toContain('notes');
    expect(fields({ ...form, notes: 'Broken window' })).not.toContain('notes');
  });

  it('matches "Other" regardless of case', () => {
    const form = validForm({ categoryAllocations: [{ category: 'other', amount: '1000' }], notes: '' });
    expect(fields(form)).toContain('notes');
  });

  it('refuses a future date but allows today', () => {
    expect(fields(validForm({ date: '2026-09-12' }))).toContain('date');
    expect(fields(validForm({ date: '2026-09-10' }))).not.toContain('date');
    expect(fields(validForm({ date: '2026-09-11' }))).not.toContain('date');
  });

  it('needs somebody or something to have paid', () => {
    expect(fields(validForm({ payerIds: [], paidFromBank: false }))).toContain('paidBy');
  });

  it('needs the account named when paying from a bank', () => {
    const form = validForm({
      paidFromBank: true,
      selectedBankAccountId: null,
      payerIds: [],
      payerAmounts: { __joint_bank__: '1000' },
    });
    expect(fields(form)).toContain('bankAccount');
  });
});

describe('category allocations', () => {
  it('rejects a fractional or zero allocation', () => {
    const form = validForm({ categoryAllocations: [{ category: 'Food', amount: '0' }] });
    expect(fields(form)).toContain('allocations');
  });

  it('asks for the remainder when allocations fall short', () => {
    const form = validForm({
      amount: '1000',
      categoryAllocations: [{ category: 'Food', amount: '600' }],
    });
    const problem = collectExpenseProblems(form).find((entry) => entry.field === 'allocations');
    expect(problem?.title).toBe('Category amounts still needed');
    expect(problem?.message).toContain('400');
  });

  it('asks for a reduction when allocations overshoot', () => {
    const form = validForm({
      amount: '1000',
      categoryAllocations: [{ category: 'Food', amount: '1500' }],
    });
    const problem = collectExpenseProblems(form).find((entry) => entry.field === 'allocations');
    expect(problem?.title).toBe('Category amounts exceed the expense');
    expect(problem?.message).toContain('500');
  });

  it('ignores rows that name no category', () => {
    expect(normalizeAllocations([{ category: '  ', amount: '5' }])).toEqual([]);
    const form = validForm({
      categoryAllocations: [{ category: '', amount: '' }, { category: 'Food', amount: '1000' }],
    });
    expect(collectExpenseProblems(form)).toEqual([]);
  });

  it('does not measure a shortfall against a missing amount', () => {
    // The fault is the amount. Telling somebody they are "KES NaN short" on
    // top of it would be noise reported as a second problem.
    const form = validForm({ amount: '', categoryAllocations: [{ category: 'Food', amount: '600' }] });
    const problems = collectExpenseProblems(form);
    expect(problems.filter((entry) => entry.field === 'allocations')).toEqual([]);
    expect(problems.map((entry) => entry.field)).toContain('amount');
  });
});

describe('recurring expenses', () => {
  it('refuses more than one category', () => {
    const form = validForm({
      isRecurring: true,
      recurringMonthlyBudget: '1000',
      amount: '1000',
      categoryAllocations: [
        { category: 'Food', amount: '500' },
        { category: 'Transport', amount: '500' },
      ],
    });
    expect(fields(form)).toContain('recurring');
  });

  it('needs a whole positive monthly budget', () => {
    expect(fields(validForm({ isRecurring: true, recurringMonthlyBudget: '' }))).toContain('recurringBudget');
    expect(fields(validForm({ isRecurring: true, recurringMonthlyBudget: '0' }))).toContain('recurringBudget');
    expect(fields(validForm({ isRecurring: true, recurringMonthlyBudget: '10.5' }))).toContain('recurringBudget');
    expect(fields(validForm({ isRecurring: true, recurringMonthlyBudget: '900' }))).not.toContain('recurringBudget');
  });
});

describe('funding', () => {
  it('needs a source when nothing is chosen', () => {
    expect(fields(validForm({ selectedSources: [], splitAmounts: {} }))).toContain('funding');
  });

  it('stays quiet on an edit whose funding was never touched', () => {
    const form = validForm({ selectedSources: [], splitAmounts: {}, isEditMode: true, fundingDirty: false });
    expect(fields(form)).not.toContain('funding');
  });

  it('skips every funding rule when the caller says the splits are preserved', () => {
    const form = validForm({
      selectedSources: [],
      splitAmounts: {},
      payerAmounts: {},
      skipFundingChecks: true,
    });
    expect(fields(form)).not.toContain('funding');
  });

  it('tolerates under a shilling of rounding across income sources', () => {
    const form = validForm({
      amount: '1000',
      selectedSources: ['a', 'b'],
      splitAmounts: { a: '600.5', b: '399.7' },
    });
    expect(fields(form)).not.toContain('funding');
  });

  it('reports a real shortfall across income sources', () => {
    const form = validForm({
      amount: '1000',
      selectedSources: ['a', 'b'],
      splitAmounts: { a: '600', b: '300' },
    });
    const problem = collectExpenseProblems(form).find((entry) => entry.field === 'funding');
    expect(problem?.title).toBe('Add another funding source');
    expect(problem?.message).toContain('100');
  });

  describe('split across several payers', () => {
    const split = (overrides: Partial<ExpenseValidationInput> = {}) =>
      validForm({
        amount: '1000',
        payerIds: ['user-1', 'user-2'],
        payerAmounts: { 'user-1': '600', 'user-2': '400' },
        payerIncomeSourceIds: { 'user-1': 3, 'user-2': 4 },
        selectedSources: [],
        splitAmounts: {},
        ...overrides,
      });

    it('accepts portions that add up', () => {
      expect(collectExpenseProblems(split())).toEqual([]);
    });

    it('rejects an empty portion', () => {
      const problems = collectExpenseProblems(split({ payerAmounts: { 'user-1': '600', 'user-2': '0' } }));
      expect(problems.map((entry) => entry.title)).toContain('Enter every funding portion');
    });

    it('needs an income source for every direct payer', () => {
      const problems = collectExpenseProblems(split({ payerIncomeSourceIds: { 'user-1': 3 } }));
      expect(problems.map((entry) => entry.title)).toContain('Income source required');
    });

    it('rejects portions that do not total the expense', () => {
      const problems = collectExpenseProblems(split({ payerAmounts: { 'user-1': '600', 'user-2': '300' } }));
      const problem = problems.find((entry) => entry.title === "Amounts don't add up");
      expect(problem?.message).toContain('900');
      expect(problem?.message).toContain('1,000');
    });

    it('does not also complain about the total when a portion is blank', () => {
      // The blank portion is the fault. A total computed from it is not a
      // second, separate thing for somebody to go and fix.
      const problems = collectExpenseProblems(split({ payerAmounts: { 'user-1': '600', 'user-2': '' } }));
      expect(problems.map((entry) => entry.title)).not.toContain("Amounts don't add up");
    });

    it('counts the bank as one of the sources', () => {
      const form = split({
        payerIds: ['user-1'],
        paidFromBank: true,
        selectedBankAccountId: 9,
        payerAmounts: { 'user-1': '600', __joint_bank__: '400' },
        payerIncomeSourceIds: { 'user-1': 3 },
      });
      expect(collectExpenseProblems(form)).toEqual([]);
    });
  });

  describe('paid entirely from a bank account', () => {
    const fromBank = (overrides: Partial<ExpenseValidationInput> = {}) =>
      validForm({
        amount: '1000',
        payerIds: [],
        paidFromBank: true,
        selectedBankAccountId: 9,
        payerAmounts: { __joint_bank__: '1000' },
        selectedSources: [],
        splitAmounts: {},
        ...overrides,
      });

    it('accepts an account covering the whole expense', () => {
      expect(collectExpenseProblems(fromBank())).toEqual([]);
    });

    it('asks for the funding amount when it is missing', () => {
      const problems = collectExpenseProblems(fromBank({ payerAmounts: {} }));
      expect(problems.map((entry) => entry.title)).toContain('Enter the funding amount');
    });

    it('names what is still unfunded', () => {
      const problems = collectExpenseProblems(fromBank({ payerAmounts: { __joint_bank__: '700' } }));
      const problem = problems.find((entry) => entry.field === 'funding');
      expect(problem?.title).toBe('Add another funding source');
      expect(problem?.message).toContain('300');
    });
  });
});

describe('several faults at once', () => {
  it('reports every one of them rather than stopping at the first', () => {
    const form = validForm({
      amount: '',
      description: '',
      category: '',
      hasNormalIncomeSource: false,
      date: '2026-12-01',
      payerIds: [],
      selectedSources: [],
      splitAmounts: {},
    });
    const found = fields(form);
    expect(found).toEqual(
      expect.arrayContaining(['amount', 'description', 'category', 'incomeSource', 'date', 'paidBy', 'funding']),
    );
    expect(found.length).toBeGreaterThanOrEqual(7);
  });

  it('keeps the original wording when only one thing is wrong', () => {
    const problems = collectExpenseProblems(validForm({ description: '' }));
    expect(describeProblems(problems)).toEqual({
      title: 'Description required',
      message: 'Please add a description.',
    });
  });

  it('numbers them under a count when several are wrong', () => {
    const problems = collectExpenseProblems(validForm({ amount: '', description: '' }));
    const described = describeProblems(problems);
    expect(described.title).toBe(`${problems.length} things need fixing`);
    expect(described.message).toContain('1. Amount required');
    expect(described.message).toContain('2. Description required');
  });
});
