import { describe, expect, it, vi } from 'vitest';
import {
  categoryPriority,
  normalizeOnboardingDraft,
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

    expect(recommended).toContain('Tuition & fees');
    expect(recommended).toContain('Transport');
    expect(draft.selectedCategories).toEqual([]);
    expect(categoryPriority('Tuition & fees')).toBe(2);
    expect(categoryPriority('a custom category')).toBe(4);
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
});
