import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const reports = readFileSync('app/(tabs)/reports.tsx', 'utf8');

// A side hustle's stock (or any other cost of earning it) can be linked to
// the income stream it eats into, so the stream's own total already reads as
// profit rather than the full sale amount. Any number of categories can
// reduce the same stream at once — a stock cost and a transport cost, say —
// so the picker is a toggle list, not a single choice.
describe('linking categories as an income stream\'s cost', () => {
  it('only a manager sees the link control, matching the server\'s own rule', () => {
    expect(reports).toContain("canManageCostCategories = group?.role === 'owner' || group?.role === 'admin'");
    expect(reports).toContain('!unattributed && canManageCostCategories');
  });

  it('shows the sales-minus-cost breakdown, naming every linked category', () => {
    expect(reports).toContain('stream.costs > 0');
    expect(reports).toContain('sales − ');
    expect(reports).toContain("linkedCostCategories.map((category) => category.name).join(', ')");
    expect(reports).toContain('= {formatKES(stream.total)} profit');
  });

  it('reads every category currently linked to a stream, not just one', () => {
    expect(reports).toContain('const linkedCostCategories = unattributed');
    expect(reports).toContain('categories.filter((category) => category.reducesIncomeSourceId === stream.incomeSourceId)');
  });

  it('toggles a category on or off a stream without touching any other category already linked to it', () => {
    expect(reports).toContain('const toggleCostCategory = useCallback((category:');
    expect(reports).toContain('if (linkedTo === incomeSourceId) {');
    expect(reports).toContain('onPress: () => void applyCostCategoryChange(category.id, null)');
    expect(reports).toContain('void applyCostCategoryChange(category.id, incomeSourceId);');
  });

  it('asks before moving a category off a different stream it already reduces', () => {
    expect(reports).toContain('if (linkedTo != null) {');
    expect(reports).toContain("'Move this category?'");
  });

  it('invalidates both the category list and this month\'s income streams after a change', () => {
    expect(reports).toContain('getGetBudgetCategoriesQueryKey()');
    expect(reports).toContain('getGetDashboardIncomeStreamsQueryKey(queryParams)');
  });

  it('explains why a category with its own sub-categories is left out of the list', () => {
    expect(reports).toContain('Only categories without sub-categories of their own are listed');
  });

  it('surfaces the feature on the Income Streams section itself, not only inside the picker', () => {
    // Nothing pointed a manager toward this until they happened to open a
    // stream and notice the picker. A manager-only hint on the section
    // heading means it can be found without already knowing it exists.
    expect(reports).toContain('Running a side hustle through one of these? Open it and link a cost category');
  });
});
