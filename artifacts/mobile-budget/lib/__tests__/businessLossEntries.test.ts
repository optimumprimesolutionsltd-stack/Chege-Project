import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { costsByCategory, type CostEntry } from '../streamCosts';

const root = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const cost = (id: number, category: string, amount: number, date: string, incomeSourceId = 7): CostEntry =>
  ({ id, category, amount, date, incomeSourceId, description: `cost ${id}`, source: id % 2 ? 'bank' : 'expense' });

// "side hustle income not showing everything...where did the loss come from,
// can i edit incase there were wrong entries etc. i need that logic for
// businesses in repports" (17 Oct 2026).
describe('where a business loss came from', () => {
  it('groups one business costs by category, biggest first, newest first inside', () => {
    const lines = costsByCategory([
      cost(1, 'Stock', 50000, '2026-09-02'),
      cost(2, 'Stock', 30000, '2026-09-20'),
      cost(3, 'Transport', 18772, '2026-09-05'),
      cost(4, 'Stock', 999, '2026-09-01', 8),
    ], 7);
    expect(lines.map((line) => [line.category, line.total])).toEqual([['Stock', 80000], ['Transport', 18772]]);
    expect(lines[0].entries.map((entry) => entry.id)).toEqual([2, 1]);
    expect(costsByCategory([cost(1, 'Stock', 1, '2026-09-01')], null)).toEqual([]);
  });

  it('All income lists a business costs under what came in, each one opening to edit', () => {
    const ledger = read('app/income-ledger.tsx');
    expect(ledger).toContain('CAME IN · {formatKES(group.received)}');
    expect(ledger).toContain('COSTS · −{formatKES(group.costs)}');
    expect(ledger).toContain('costsByCategory(costEntries, group.incomeSourceId)');
    expect(ledger).toContain("cost.source === 'expense' ? getExpenseEditHref({ id: cost.id, date: cost.date }) : bankEditHref(cost.id, cost.accountId)");
    expect(ledger).toContain('onPress={() => router.push(bankEditHref(entry.transactionId) as never)}');
  });

  it('the Business report entries open to edit too', () => {
    const business = read('app/business.tsx');
    expect(business).toContain("if (entry.source === 'expense') return getExpenseEditHref({ id: entry.id, date: entry.date });");
    expect(business).toContain("returnTo=${encodeURIComponent('/business')}");
    expect(business).toContain('onPress={href ? () => router.push(href as never) : undefined}');
  });
});
