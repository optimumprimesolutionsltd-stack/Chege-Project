import { describe, expect, it, vi } from 'vitest';
import {
  canonicalCategoryName,
  categoryPriority,
  dedupeCategoryNames,
  dedupeIncomeStreamNames,
  normalizeOnboardingDraft,
  normalizeIncomeStreamName,
  onboardingDraftStorageKey,
  readOnboardingDraft,
  recommendedCategoriesForPurpose,
  saveOnboardingDraft,
  type MobileOnboardingDraft,
} from '../onboarding';

describe('mobile onboarding', () => {
  const draft: MobileOnboardingDraft = {
    usageMode: 'personal',
    persona: 'student',
    budgetDuration: 'month',
    customEndDate: '',
    selectedCategories: [],
    customCategories: [],
    categoryBudgets: {},
    selectedIncomeStreams: [],
    incomeAmounts: {},
  };

  it('recommends categories by purpose without preselecting any', () => {
    const recommended = recommendedCategoriesForPurpose('student');

    expect(recommended).toContain('Education');
    expect(recommended).toContain('Transport');
    expect(draft.selectedCategories).toEqual([]);
    expect(categoryPriority('Education')).toBe(2);
    expect(categoryPriority('a custom category')).toBe(4);
  });

  it('collapses semantic category aliases into one canonical recommendation', () => {
    expect(canonicalCategoryName(' rent ')).toBe('Housing');
    expect(dedupeCategoryNames(['Food', 'Food & meals', 'Groceries', 'Housing', 'Accommodation', 'Rent'])).toEqual(['Food', 'Housing']);
    expect(recommendedCategoriesForPurpose('student')).toContain('Housing');
    expect(recommendedCategoriesForPurpose('student')).not.toContain('Accommodation');
    expect(recommendedCategoriesForPurpose('student')).not.toContain('Rent');
  });

  it('scopes saved drafts to the user and restores a valid draft', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn(async (key: string) => values.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
      removeItem: vi.fn(async (key: string) => { values.delete(key); }),
    };

    await saveOnboardingDraft({ userId: 'person/a', draft, storage });
    expect(values.has(onboardingDraftStorageKey('person/a'))).toBe(true);
    await expect(readOnboardingDraft({ userId: 'person/a', storage })).resolves.toEqual(draft);
    await expect(readOnboardingDraft({ userId: 'person/b', storage })).resolves.toBeNull();
  });

  it('fails closed when draft storage is corrupt or unavailable', async () => {
    const unavailable = {
      getItem: vi.fn(async () => { throw new Error('disk unavailable'); }),
    };
    await expect(readOnboardingDraft({ userId: 'person', storage: unavailable })).resolves.toBeNull();

    expect(normalizeOnboardingDraft({ ...draft, selectedCategories: 'Food' })).toBeNull();
    expect(normalizeOnboardingDraft({ ...draft, usageMode: 'returning' })).toBeNull();
  });

  it('normalizes semantic aliases in restored category drafts', () => {
    expect(normalizeOnboardingDraft({
      ...draft,
      selectedCategories: ['Rent', 'Accommodation', 'Housing'],
      customCategories: [' Food & meals ', 'Groceries'],
      categoryBudgets: { Rent: '12000', Accommodation: '9000' },
    })?.selectedCategories).toEqual(['Housing']);
    expect(normalizeOnboardingDraft({
      ...draft,
      selectedCategories: ['Rent'],
      customCategories: [],
      categoryBudgets: { Rent: '12000' },
    })?.categoryBudgets).toEqual({ Housing: '12000' });
  });

  it('deduplicates restored income streams regardless of case or surrounding whitespace', () => {
    expect(normalizeIncomeStreamName(' Salary Or Wages ')).toBe('salary or wages');
    expect(dedupeIncomeStreamNames([
      'Salary or wages',
      ' salary OR WAGES ',
      'Freelance work',
    ])).toEqual(['Salary or wages', 'Freelance work']);
    expect(normalizeOnboardingDraft({
      ...draft,
      selectedIncomeStreams: ['Salary', ' salary '],
    })?.selectedIncomeStreams).toEqual(['Salary']);
  });
});
