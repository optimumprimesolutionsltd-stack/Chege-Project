import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_ONBOARDING_CATEGORIES, CATEGORY_HINTS, recommendedCategoriesForPurpose } from '../onboarding';

// "There should be more categories, e.g. education, emergency", "it's good to
// give them everything", and "there is a lot of confusion here" (5 Oct 2026).
describe('the categories setup offers', () => {
  it('suggests education and emergencies to people with a household to run', () => {
    for (const persona of ['working', 'business', 'couple', 'family']) {
      expect(recommendedCategoriesForPurpose(persona)).toEqual(expect.arrayContaining(['Education', 'Emergencies', 'Loans']));
    }
    expect(recommendedCategoriesForPurpose('business')).toEqual(expect.arrayContaining(['Housing', 'Utilities', 'Family support']));
  });

  it('says in a line what every category is for', () => {
    for (const category of ALL_ONBOARDING_CATEGORIES) expect(CATEGORY_HINTS[category], category).toBeTruthy();
    expect(CATEGORY_HINTS['Stock & inventory']).toBe('Goods you buy to sell on.');
  });

  it('shows every category, the suggested ones starred, and amounts as optional', () => {
    const screen = readFileSync('app/budget-chooser.tsx', 'utf8');
    expect(screen).not.toContain('tier.categories.filter((category) => recommendedCategories.includes(category))');
    expect(screen).toContain('<Feather name="star"');
    expect(screen).toContain('testID="onboarding-select-every"');
    expect(screen).toContain('placeholder="Optional"');
  });
});
