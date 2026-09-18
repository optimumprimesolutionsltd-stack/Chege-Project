import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BUDGET_GOALS,
  DEBT_ONBOARDING_CATEGORIES,
  groupKindForPersona,
  isDebtOnboardingCategory,
  normalizeOnboardingDraft,
  recommendedCategoriesForGoal,
  recommendedCategoriesForPurpose,
  trackedDebtsFromDraft,
} from '../onboarding';

const baseDraft = {
  usageMode: 'personal' as const,
  persona: 'working',
  coupleStage: null,
  budgetDuration: 'ongoing' as const,
  customEndDate: '',
  selectedCategories: [],
  customCategories: [],
  categoryBudgets: {},
  selectedIncomeStreams: [],
  incomeAmounts: {},
};

// Somebody whose reason for using Jamvi is clearing a loan was handed a
// budgeting app and left to find out debt existed.
describe('what the budget is mainly for', () => {
  it('offers paying off debt alongside the other two', () => {
    expect(Object.keys(BUDGET_GOALS)).toEqual(['budgeting', 'saving', 'debt']);
    expect(BUDGET_GOALS.debt.title).toBe('Paying off debt');
  });

  it('changes nothing for anyone who does not pick debt', () => {
    for (const goal of ['budgeting', 'saving', null, undefined] as const) {
      expect(recommendedCategoriesForGoal(goal, 'working')).toEqual(
        recommendedCategoriesForPurpose('working'),
      );
    }
  });

  it('leads with debts, and still feeds you', () => {
    const suggested = recommendedCategoriesForGoal('debt', 'working');
    expect(suggested.slice(0, DEBT_ONBOARDING_CATEGORIES.length)).toEqual([...DEBT_ONBOARDING_CATEGORIES]);
    // The ordinary categories survive underneath — somebody clearing a loan
    // still eats.
    expect(suggested).toContain('Food');
  });

  it('names debts people actually carry', () => {
    expect(DEBT_ONBOARDING_CATEGORIES).toContain('Sacco loan');
    expect(DEBT_ONBOARDING_CATEGORIES).toContain('Chama advance');
    expect(DEBT_ONBOARDING_CATEGORIES).toContain('Mobile loan');
  });

  it('recognises a debt category whatever the casing', () => {
    expect(isDebtOnboardingCategory('bank loan')).toBe(true);
    expect(isDebtOnboardingCategory('  Sacco Loan ')).toBe(true);
    expect(isDebtOnboardingCategory('Food')).toBe(false);
  });
});

describe('turning the answer into tracked debts', () => {
  it('tracks only the debt categories that were given a balance', () => {
    const tracked = trackedDebtsFromDraft({
      budgetGoal: 'debt',
      selectedCategories: ['Bank loan', 'Sacco loan', 'Food'],
      debtBalances: { 'Bank loan': '120000', 'Sacco loan': '' },
    });
    // A debt with no balance has nothing to count down, so it stays an
    // ordinary category rather than an empty entry on the Debt tab.
    expect(tracked).toEqual([{ name: 'Bank loan', balance: 120_000 }]);
  });

  it('tracks nothing when the goal is not debt', () => {
    expect(trackedDebtsFromDraft({
      budgetGoal: 'saving',
      selectedCategories: ['Bank loan'],
      debtBalances: { 'Bank loan': '120000' },
    })).toEqual([]);
  });

  it('ignores a balance that is not a usable number', () => {
    expect(trackedDebtsFromDraft({
      budgetGoal: 'debt',
      selectedCategories: ['Bank loan', 'Sacco loan'],
      debtBalances: { 'Bank loan': 'abc', 'Sacco loan': '-5' },
    })).toEqual([]);
  });
});

describe('a resumed draft keeps the answer', () => {
  it('carries the goal and balances back', () => {
    const restored = normalizeOnboardingDraft({ ...baseDraft, budgetGoal: 'debt', debtBalances: { 'Bank loan': '5000' } });
    expect(restored?.budgetGoal).toBe('debt');
    expect(restored?.debtBalances?.['Bank loan']).toBe('5000');
  });

  it('treats an unknown goal as unanswered rather than guessing', () => {
    expect(normalizeOnboardingDraft({ ...baseDraft, budgetGoal: 'nonsense' })?.budgetGoal).toBeNull();
  });

  it('leaves a draft made before the question existed alone', () => {
    expect(normalizeOnboardingDraft(baseDraft)?.budgetGoal).toBeNull();
  });
});

// Onboarding asks who the budget is for; creating the group then asked the
// same thing again as "kind", which reads as the app not having listened.
describe('the answer carries through to creating the group', () => {
  it('maps a couple to the kind that covers couples and housemates', () => {
    expect(groupKindForPersona('couple')).toBe('family');
    expect(groupKindForPersona('friends')).toBe('family');
    expect(groupKindForPersona('family')).toBe('family');
  });

  it('carries the answers that map one-to-one', () => {
    expect(groupKindForPersona('chama')).toBe('chama');
    expect(groupKindForPersona('church')).toBe('church');
    expect(groupKindForPersona('student_group')).toBe('student_group');
  });

  it('still asks when onboarding implied nothing', () => {
    expect(groupKindForPersona(null)).toBeNull();
    expect(groupKindForPersona('working')).toBeNull();
  });

  it('states the remembered answer instead of asking again, but lets it change', () => {
    const chooser = readFileSync('app/budget-chooser.tsx', 'utf8');
    expect(chooser).toContain('groupKindForPersona(savedDraft?.persona ?? null)');
    expect(chooser).toContain('From what you told us at the start.');
    expect(chooser).toContain('testID="shared-budget-kind-change"');
    // The full list is still there for anyone who says it is wrong.
    expect(chooser).toContain('impliedGroupKind && !editingGroupKind ? [] : SHARED_GROUP_KINDS.map');
  });
});
