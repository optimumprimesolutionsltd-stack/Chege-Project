import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Side-by-side check, batch 3: what the web had and the phone did not.
describe('the phone has the web’s sub-category tidy-up and goal mismatch warning', () => {
  it('offers the sub-category tidy-up in Settings, applied only on Apply', () => {
    const settings = readFileSync('app/(tabs)/settings.tsx', 'utf8');
    expect(settings).toContain('<SubcategorySuggestions canManage={group?.isPrivate === true || canManageShared} />');
    const card = readFileSync('components/SubcategorySuggestions.tsx', 'utf8');
    expect(card).toContain("customFetch<Suggestions>('/api/budget-categories/subcategory-suggestions')");
    expect(card).toContain("'/api/budget-categories/subcategory-suggestions/apply'");
    expect(card).toContain('if (isLoading || !data?.applicable || (data.matched.length === 0 && data.unparented.length === 0)) return null;');
  });

  it('warns on Goals when a saved amount and its contributions disagree', () => {
    const goals = readFileSync('app/(tabs)/goals.tsx', 'utf8');
    expect(goals).toContain("customFetch('/api/savings-goals/consistency-check')");
    expect(goals).toContain('testID="goals-balance-mismatch"');
  });

  it('keeps the shared budget plan, report and debt sums identical on the web', () => {
    const twins = readFileSync('scripts/sync-web-twins.py', 'utf8');
    for (const name of ["'budgetPlan.ts'", "'budgetReport.ts'", "'debtSummary.ts'"]) expect(twins).toContain(name);
  });
});
