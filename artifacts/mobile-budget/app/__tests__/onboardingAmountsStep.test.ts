import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/budget-chooser.tsx', 'utf8');
const webSource = readFileSync('../family-budget/src/components/budget-chooser.tsx', 'utf8');
const amountsStep = source.slice(source.indexOf('{step === 5 ? <>'), source.indexOf('{error ? <Text accessibilityRole="alert"'));

describe('onboarding amounts step (5 Oct 2026)', () => {
  it('takes amounts against subcategories only, never against the category itself', () => {
    expect(amountsStep).toContain('onboardingSubcategoriesFor(category, draft)');
    expect(amountsStep).toContain('testID={`onboarding-amount-${category}-${child}`}');
    // The single amount box a category used to have is gone, and nothing on
    // the step writes a category-level amount.
    expect(amountsStep).not.toContain('testID={`onboarding-amount-${category}`}');
    expect(amountsStep).not.toContain("setDraftValue('categoryBudgets'");
  });

  it('shows each category as the total of its subcategories, and the plan as the total of those', () => {
    expect(amountsStep).toContain('const subtotal = plannedCategoryAmount(draft, category);');
    expect(amountsStep).toContain('reduce((sum, category) => sum + plannedCategoryAmount(draft, category), 0)');
  });

  it('lets a category gain a subcategory of its own, so a custom one can be planned', () => {
    expect(amountsStep).toContain('testID={`onboarding-add-subcategory-${category}`}');
    expect(source).toContain('const addSubcategory = (category: string) => {');
  });

  it('preselects everyday budgeting as the duration, on the phone and the web', () => {
    expect(source).toMatch(/budgetDuration: 'ongoing',\s*customEndDate: '',\s*lastStep: 0,/);
    expect(webSource).toContain('useState<"ongoing" | "week" | "month" | "quarter" | "custom" | null>("ongoing")');
  });
});
