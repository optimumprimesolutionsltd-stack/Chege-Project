import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const screen = readFileSync('app/business.tsx', 'utf8');
const sheet = readFileSync('components/BusinessCostCategories.tsx', 'utf8');
const reports = readFileSync('app/(tabs)/reports.tsx', 'utf8');
const more = readFileSync('app/(tabs)/more.tsx', 'utf8');
const layout = readFileSync('app/_layout.tsx', 'utf8');
const hook = readFileSync('hooks/useHasBusiness.ts', 'utf8');

// "I need a better way of understanding": sales, cost of goods sold and
// expenses together, the way a business reads its numbers.
describe('the Business screen', () => {
  it('reads each side hustle as a profit and loss statement', () => {
    for (const line of ["row('Sales'", "'Cost of goods sold'", "row('Gross profit'", "'Expenses'", "row('Net profit'"]) {
      expect(screen).toContain(line);
    }
  });

  it('shows margins as a share of sales, and none when nothing sold', () => {
    expect(screen).toContain('return sales > 0 ? `${Math.round((part / sales) * 100)}%` : null;');
  });

  it('opens each cost to the categories behind it', () => {
    expect(screen).toContain("costRows(`${business.incomeSourceId}-cogs`, 'Cost of goods sold'");
    expect(screen).toContain("costRows(`${business.incomeSourceId}-expense`, 'Expenses'");
  });

  it('adds the businesses up when there is more than one', () => {
    expect(screen).toContain('{businesses.length > 1 && totals ? (');
  });

  it('shows a loss in red, as a loss', () => {
    expect(screen).toContain("{business.netProfit < 0 ? 'Loss' : 'Profit'}");
  });

  it('says how to set one up when there is none', () => {
    expect(screen).toContain('testID="business-none"');
  });

  it('goes month by month, not into the future, with the month in the cache key', () => {
    expect(screen).toContain('queryKey: getGetDashboardBusinessQueryKey(params)');
    expect(screen).toContain('disabled={isCurrentMonth}');
  });

  it('is registered as a screen', () => {
    expect(layout).toContain('<Stack.Screen name="business"');
  });
});

describe('getting to it', () => {
  it('is on Reports and in More, only for a budget with a side hustle', () => {
    expect(reports).toContain('{hasBusiness ? (');
    expect(reports).toContain("router.push('/business')");
    expect(more).toContain('show: hasBusiness,');
    expect(hook).toContain('return (data?.businesses?.length ?? 0) > 0;');
  });
});

describe('choosing what kind of cost a category is', () => {
  it('offers cost of goods sold or expense on each linked category', () => {
    expect(sheet).toContain("[['cogs', 'Cost of goods sold'], ['expense', 'Expense']]");
    expect(sheet).toContain('await updateCategory.mutateAsync({ id: categoryId, data: { costKind } });');
  });

  it('reads a category with no kind yet as cost of goods sold, as links always were', () => {
    expect(sheet).toContain("pendingKind[category.id] ?? (category.costKind === 'expense' ? 'expense' : 'cogs')");
  });

  it('refreshes every month of the statement when a cost changes', () => {
    expect(sheet).toContain('void queryClient.invalidateQueries({ queryKey: getGetDashboardBusinessQueryKey() });');
    expect((sheet.match(/await refresh\(\);/g) ?? []).length).toBe(2);
  });
});
