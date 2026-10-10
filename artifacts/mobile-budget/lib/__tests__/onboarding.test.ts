import { describe, expect, it, vi } from 'vitest';
import {
  budgetDurationEditError,
  budgetDurationLabels,
  canonicalCategoryName,
  categoryPriority,
  dedupeCategoryNames,
  dedupeIncomeStreamNames,
  incomeStreamsForMode,
  normalizeOnboardingDraft,
  normalizeIncomeStreamName,
  onboardingDraftStorageKey,
  onboardingSubcategoriesFor,
  plannedCategoryAmount,
  ALL_ONBOARDING_CATEGORIES,
  DEBT_ONBOARDING_CATEGORIES,
  ONBOARDING_SUBCATEGORIES,
  readOnboardingDraft,
  recommendedCategoriesForPurpose,
  saveOnboardingDraft,
  type MobileOnboardingDraft,
} from '../onboarding';

describe('mobile onboarding', () => {
  const draft: MobileOnboardingDraft = {
    usageMode: 'personal',
    persona: 'student',
    coupleStage: null,
    budgetDuration: 'month',
    customEndDate: '',
    lastStep: 0,
    selectedCategories: [],
    customCategories: [],
    categoryBudgets: {},
    selectedIncomeStreams: [],
    incomeAmounts: {},
    memberContribution: '',
    expectedMemberCount: '',
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

  it('gives a couple or family household income sources, not chama dues', () => {
    const couple = incomeStreamsForMode('shared', 'couple');
    expect(couple).toContain('Salary or wages');
    expect(couple).not.toContain('Fines and penalties');
    expect(couple).not.toContain('Member contributions');

    const chama = incomeStreamsForMode('shared', 'chama');
    expect(chama).toContain('Member contributions');
    expect(chama).toContain('Fines and penalties');
  });

  it('gives a couple planning a wedding wedding-specific income sources', () => {
    const wedding = incomeStreamsForMode('shared', 'couple', 'wedding');
    expect(wedding).toContain('Wedding gifts or cash gifts');
    expect(wedding).toContain('Family contributions');
    expect(wedding).not.toContain('Fines and penalties');
  });

  it('ignores persona for a personal budget', () => {
    expect(incomeStreamsForMode('personal', 'chama')).toContain('Salary or wages');
  });

  it('recommends wedding categories for a couple planning a wedding, not household bills', () => {
    const wedding = recommendedCategoriesForPurpose('couple', 'wedding');
    expect(wedding).toContain('Venue');
    expect(wedding).not.toContain('Shared bills');

    const together = recommendedCategoriesForPurpose('couple', 'together');
    expect(together).toContain('Shared bills');
    expect(together).not.toContain('Venue');
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
    // Normalising fills in the fields added since this fixture was written:
    // what the budget is for, any debt balances against it, and whether the
    // person runs a business. All default to "not asked", which is what every
    // draft made before the question existed should read as.
    await expect(readOnboardingDraft({ userId: 'person/a', storage })).resolves.toEqual({
      ...draft,
      budgetGoal: null,
      debtBalances: {},
      subcategoryBudgets: {},
      customSubcategories: {},
      runsBusiness: null,
      businessName: '',
      moreBusinessNames: [],
      businessPay: [],
    });
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

describe('editing a budget plan’s duration after setup', () => {
  it('allows any non-custom duration regardless of end date', () => {
    expect(budgetDurationEditError('ongoing', '')).toBeNull();
    expect(budgetDurationEditError('week', '')).toBeNull();
    expect(budgetDurationEditError('month', '')).toBeNull();
    expect(budgetDurationEditError('quarter', '')).toBeNull();
  });

  it('requires an end date for a custom duration', () => {
    expect(budgetDurationEditError('custom', '')).toBe('Choose an end date for this budget.');
  });

  it('rejects a custom end date that is today or in the past', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(budgetDurationEditError('custom', today)).toBe('Choose an end date in the future.');
  });

  it('accepts a custom end date in the future', () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    expect(budgetDurationEditError('custom', future.toISOString().slice(0, 10))).toBeNull();
  });
});

describe('budgetDurationLabels', () => {
  it('calls the ongoing option "budgeting" for a personal account', () => {
    expect(budgetDurationLabels(false).ongoing.title).toBe('Everyday budgeting');
  });

  it('calls the ongoing option "contributions" for a shared group, not "budgeting"', () => {
    const label = budgetDurationLabels(true).ongoing;
    expect(label.title).toBe('Everyday contributions');
    expect(label.title.toLowerCase()).not.toContain('budgeting');
    expect(label.description.toLowerCase()).not.toContain('budgeting');
  });

  it('leaves every other duration option worded the same regardless of context', () => {
    const personal = budgetDurationLabels(false);
    const shared = budgetDurationLabels(true);
    for (const key of ['week', 'month', 'quarter', 'custom'] as const) {
      expect(shared[key]).toEqual(personal[key]);
    }
  });
});

describe('onboarding subcategories', () => {
  it('opens every category onboarding offers into subcategories, so none needs an amount of its own', () => {
    expect(onboardingSubcategoriesFor('Food')).toEqual(['Groceries', 'Market shopping', 'Eating out']);
    const offered = dedupeCategoryNames([
      ...ALL_ONBOARDING_CATEGORIES,
      ...['student', 'working', 'business', 'couple', 'friends', 'family', 'chama', 'church', 'club', 'student_group'].flatMap((persona) => recommendedCategoriesForPurpose(persona)),
      ...recommendedCategoriesForPurpose('couple', 'wedding'),
    ]);
    expect(offered.filter((category) => onboardingSubcategoriesFor(category).length === 0)).toEqual([]);
    // A custom category has only what the person adds.
    expect(onboardingSubcategoriesFor('Farm')).toEqual([]);
    expect(onboardingSubcategoriesFor('Farm', { customSubcategories: { Farm: ['Seeds', 'seeds '] } })).toEqual(['Seeds']);
  });

  it('never repeats a name, nor reuses a category or debt name, since a budget allows each name once', () => {
    const subNames = Object.values(ONBOARDING_SUBCATEGORIES).flat().map((name) => name.toLowerCase());
    expect(new Set(subNames).size).toBe(subNames.length);
    const taken = new Set([...Object.keys(ONBOARDING_SUBCATEGORIES), ...ALL_ONBOARDING_CATEGORIES, ...DEBT_ONBOARDING_CATEGORIES, 'Transaction charges', 'M-Pesa charges', 'Fuliza charges', 'Bank charges'].map((name) => name.toLowerCase()));
    expect(subNames.filter((name) => taken.has(name))).toEqual([]);
  });

  it('plans a category at its subcategories added up, never an amount of its own', () => {
    const amounts = { subcategoryBudgets: { Food: { Groceries: '8000', 'Eating out': '1500.6', Bogus: '700' }, Farm: { Seeds: '300' } }, customSubcategories: { Farm: ['Seeds'] } };
    // A name that is not one of its subcategories does not count.
    expect(plannedCategoryAmount(amounts, 'Food')).toBe(9501);
    expect(plannedCategoryAmount(amounts, 'Farm')).toBe(300);
    expect(plannedCategoryAmount(amounts, 'Housing')).toBe(0);
    expect(plannedCategoryAmount(amounts, 'Pets')).toBe(0);
  });

  it('keeps subcategory amounts through a saved draft', () => {
    const restored = normalizeOnboardingDraft({
      usageMode: 'personal', budgetDuration: 'ongoing', selectedCategories: ['Food'], customCategories: [], selectedIncomeStreams: [],
      subcategoryBudgets: { groceries: { Groceries: '8000', Junk: 5 }, Food: { 'Eating out': '400' } },
      customSubcategories: { Farm: ['Seeds', 3, ' '] },
    });
    expect(restored?.subcategoryBudgets).toEqual({ Food: { Groceries: '8000', 'Eating out': '400' } });
    expect(restored?.customSubcategories).toEqual({ Farm: ['Seeds'] });
  });
});

