import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { isHistoryQuery, refreshAfterSave } from '@/lib/refreshAfterSave';

// Lag audit, 7 Oct 2026: every save refetched every query, and mounted tab
// screens each downloaded the whole history again.
describe('what a save refreshes', () => {
  it('knows the whole-history queries', () => {
    expect(isHistoryQuery(['/api/joint-account'])).toBe(true);
    expect(isHistoryQuery(['/api/joint-account', { accountId: 3 }])).toBe(true);
    expect(isHistoryQuery(['/api/dashboard/expense-ledger', { from: '2026-09-01' }])).toBe(true);
    expect(isHistoryQuery(['/api/budget-categories'])).toBe(false);
    expect(isHistoryQuery(['entries-to-sort'])).toBe(false);
  });

  it('marks a history out of date without fetching it, and refreshes the rest', async () => {
    const client = new QueryClient();
    client.setQueryData(['/api/joint-account'], { transactions: [] });
    client.setQueryData(['/api/budget-categories'], []);
    refreshAfterSave(client);
    await Promise.resolve();
    expect(client.getQueryState(['/api/joint-account'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['/api/budget-categories'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['/api/joint-account'])?.fetchStatus).toBe('idle');
  });

  it('is what the app does after a save, and histories reload when their screen comes into view', () => {
    const layout = readFileSync('app/_layout.tsx', 'utf8');
    expect(layout).toContain('const refreshEverything = afterQuiet(() => refreshAfterSave(queryClient));');
    expect(layout).toContain('refreshShownHistory(queryClient);');
    expect(layout).toContain('return failureCount < 2;');
  });
});
