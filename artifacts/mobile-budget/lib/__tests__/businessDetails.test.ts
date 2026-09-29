import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const screen = readFileSync('app/business.tsx', 'utf8');

// "Make it more detailed if the user wants, with the option of hiding."
describe('business details', () => {
  it('are off until asked for, per business, and remembered on the phone', () => {
    expect(screen).toContain("const DETAILS_KEY = 'jamvi:business-details-open';");
    expect(screen).toContain("{detailed.has(business.incomeSourceId) ? 'Hide details' : 'Show details'}");
  });

  it('are only fetched while shown, and the choice is in the cache key', () => {
    expect(screen).toContain('const params = { month, year, ...(detailed.size > 0 ? { detail: true } : {}) };');
    expect(screen).toContain('queryKey: getGetDashboardBusinessQueryKey(params)');
  });

  it('open the sales to each sale, and each cost to its entries', () => {
    expect(screen).toContain('entryRows(salesKey, salesEntries, business.moreSalesEntries ?? 0)');
    expect(screen).toContain('entryRows(lineKey, line.entries, line.more ?? 0)');
  });

  it('show each cost as a share of sales', () => {
    expect(screen).toContain('{Math.round(line.shareOfSales)}% of sales');
  });

  it('compare with the month before, with the change', () => {
    expect(screen).toContain('Compared with {monthName}');
    expect(screen).toContain("{change === 0 ? 'same' :");
  });

  it('explain a month where stock bought outran sales', () => {
    expect(screen).toContain('{withDetails && business.costOfGoodsSold > business.sales ? (');
    expect(screen).toContain('Stock counts in the month it is bought, not the month it sells.');
  });
});

// "Can't see cost categories": the way in was a link inside Reports' income
// stream cards. Each statement now links there.
describe('changing which costs count', () => {
  it('is a link on every statement', () => {
    expect(screen).toContain("router.push('/(tabs)/reports')");
    expect(screen).toContain('testID={`business-change-costs-${business.incomeSourceId}`}');
  });
});
