import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// "Need to be able to edit" (9 Oct 2026): tapping a Search result opened only
// the tab it lives on. An expense or bank entry now opens itself to edit.
const screen = readFileSync('app/(tabs)/search.tsx', 'utf8');
const route = readFileSync('../api-server/src/routes/ai.ts', 'utf8');

describe('a Search result opens to edit', () => {
  it('a bank entry opens on Bank, on its own account, and comes back to Search', () => {
    expect(screen).toContain("if (kind === 'bank') return `/(tabs)/bank?editTx=${id}${accountId ? `&accountId=${accountId}` : ''}&returnTo=${encodeURIComponent('/(tabs)/search')}`;");
    expect(route).toContain('accountId: jointAccountTxTable.accountId,');
  });

  it('an expense opens its edit form', () => {
    expect(screen).toContain("if (kind === 'expenses') return getExpenseEditHref({ id, date: date ?? '' });");
    expect(screen).toContain('router.push(destinationFor(item) as never)');
  });
});
