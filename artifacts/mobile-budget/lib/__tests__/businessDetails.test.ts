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

// "If I want to see all as detailed, not one by one" - but keeping each business's own.
describe('one switch for every business', () => {
  it("opens them all, or closes them all, beside each one's own", () => {
    expect(screen).toContain("{allDetailed ? 'Hide all details' : 'Show all details'}");
    expect(screen).toContain('const allDetailed = businesses.length > 0 && businesses.every((business) => detailed.has(business.incomeSourceId));');
    expect(screen).toContain("{detailed.has(business.incomeSourceId) ? 'Hide details' : 'Show details'}");
  });
});

const reports = readFileSync('app/(tabs)/reports.tsx', 'utf8');

describe('income stream details', () => {
  it('open per stream or all at once, and are remembered on the phone', () => {
    expect(reports).toContain("const STREAM_DETAILS_KEY = 'jamvi:income-stream-details-open';");
    expect(reports).toContain("{allStreamsDetailed ? 'Hide all details' : 'Show all details'}");
    expect(reports).toContain("{detailedStreams.has(streamKey(stream.incomeSourceId)) ? 'Hide details' : 'Show details'}");
  });

  it('fetch All income only while shown, and give each stream its own share of a split entry', () => {
    expect(reports).toContain('enabled: showingStreamDetails');
    expect(reports).toContain('.filter((portion) => (portion.incomeSourceId ?? null) === (incomeSourceId ?? null))');
  });

  it('list each linked cost as cost of goods sold or an expense', () => {
    expect(reports).toContain("{category.name} · {category.costKind === 'expense' ? 'Expense' : 'Cost of goods sold'}");
  });
});

// "Can't see cost categories": the way in was a link inside Reports' income
// stream cards. Each statement now links there.
describe('changing which costs count', () => {
  it('is a link on every statement', () => {
    expect(screen).toContain("router.navigate({ pathname: '/(tabs)/reports', params: { costsFor: String(incomeSourceId), costsName: name } });");
    expect(screen).toContain('if (router.canDismiss()) router.dismissAll();');
    expect(screen).toContain('testID={`business-change-costs-${business.incomeSourceId}`}');
  });
});
