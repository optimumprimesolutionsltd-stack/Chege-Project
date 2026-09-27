import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const reports = readFileSync('app/(tabs)/reports.tsx', 'utf8');

// A side hustle's stock (or any other cost of earning it) can be linked to
// the income stream it eats into, so the stream's own total already reads as
// profit rather than the full sale amount.
describe('linking a category as an income stream\'s cost', () => {
  it('only a manager sees the link control, matching the server\'s own rule', () => {
    expect(reports).toContain("canManageCostCategories = group?.role === 'owner' || group?.role === 'admin'");
    expect(reports).toContain('!unattributed && canManageCostCategories');
  });

  it('shows the sales-minus-cost breakdown once a category is linked', () => {
    expect(reports).toContain('stream.costs > 0');
    expect(reports).toContain('sales − ');
    expect(reports).toContain('= {formatKES(stream.total)} profit');
  });

  it('moves the link off whichever category held it before setting a new one', () => {
    expect(reports).toContain('const previouslyLinked = categories.find((category) => category.reducesIncomeSourceId === incomeSourceId) ?? null;');
    expect(reports).toContain("if (previouslyLinkedId != null && previouslyLinkedId !== categoryId)");
    expect(reports).toContain('reducesIncomeSourceId: null');
  });

  it('invalidates both the category list and this month\'s income streams after a change', () => {
    expect(reports).toContain('getGetBudgetCategoriesQueryKey()');
    expect(reports).toContain('getGetDashboardIncomeStreamsQueryKey(queryParams)');
  });

  it('offers a "None" option to clear the link entirely', () => {
    expect(reports).toContain('testID="cost-category-none"');
    expect(reports).toContain('chooseCostCategory(null)');
  });

  it('asks before swapping a stream onto a different category, since that silently unlinks the old one', () => {
    expect(reports).toContain("if (previouslyLinked && categoryId != null && previouslyLinked.id !== categoryId)");
    expect(reports).toContain("'Replace the cost category?'");
  });

  it('does not ask when clearing the link to None, or when there was nothing linked before', () => {
    expect(reports).toContain('void applyCostCategoryChoice(incomeSourceId, previouslyLinked?.id ?? null, categoryId);');
  });

  it('explains why a category with its own sub-categories is left out of the list', () => {
    expect(reports).toContain('Only categories without sub-categories of their own are listed');
  });
});
