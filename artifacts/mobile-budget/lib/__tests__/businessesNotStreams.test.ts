import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// "remove logic of income streams as businesses to avoid confusion", "there
// should be an option to count the business profits or not", "where do I name
// the business / supplier?" (8 Oct 2026).
const read = (p: string) => readFileSync(p, 'utf8');

describe('a business is never an income stream', () => {
  const screen = read('app/businesses.tsx');
  const bank = read('app/(tabs)/bank.tsx');
  const named = read('app/named-accounts.tsx');

  it('My businesses lists businesses only - no income streams, no "Make it a business"', () => {
    expect(screen).not.toContain('Make it a business');
    expect(screen).not.toContain('/api/income-sources');
    expect(screen).toContain('businesses.list.map((business) =>');
  });

  it('nothing falls back to "a stream with costs is a business"', () => {
    expect(bank).not.toContain('businesses.named ?');
    expect(bank).not.toContain('!businesses.named ||');
    expect(bank).toContain('const listed = businesses.list.map((one) =>');
    expect(named).toContain('const businesses = streams.filter((one) => namedBusinesses.ids.has(one.id));');
  });

  it('a category linked to an income stream is not a business cost on Bank', () => {
    expect(bank).toContain('.filter((row) => row.reducesIncomeSourceId != null && businesses.ids.has(Number(row.reducesIncomeSourceId)))');
  });

  it('pickers for money in and for what funded an expense leave businesses out', () => {
    expect(bank).toContain('{depositSources.filter((src) => !businesses.ids.has(src.id)).map((src) => {');
    expect(read('app/bank-day.tsx')).toContain('{incomeSources.filter((source) => !businesses.ids.has(source.id)).map((source) => {');
    expect(read('app/add-expense.tsx')).toContain('&streams=only');
    expect(read('app/(tabs)/history.tsx')).toContain('&streams=only');
  });
});

describe('count its profit, or its money only passes through', () => {
  const screen = read('app/businesses.tsx');
  const card = read('components/WhoIsThisFor.tsx');
  const hook = read('hooks/useBusinesses.ts');

  it('is a switch on each business', () => {
    expect(screen).toContain('testID={`business-counts-profit-${business.id}`}');
    expect(hook).toContain('const setCountsProfit = useCallback(');
  });

  it('says on the entry which it is', () => {
    expect(card).toContain("chosen.countsProfit === false");
    expect(card).toContain('Its profit is not counted here, so no Business report.');
  });
});

describe('naming the payee on the entry', () => {
  const card = read('components/WhoIsThisFor.tsx');
  const bank = read('app/(tabs)/bank.tsx');

  it('is a box on the card, kept in Named accounts after Save', () => {
    expect(card).toContain('testID="who-for-payee-name"');
    expect(bank).toContain('payeeName={whoForPayeeName}');
    expect(bank).toContain("name: entry.name?.trim() || namedPayees.nameFor(entry.description) || label");
  });
});
