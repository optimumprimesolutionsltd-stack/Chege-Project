import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// "find the app to be slow or failed when changing months" on All expenses (7 Oct 2026).
describe('All expenses when changing month', () => {
  const screen = readFileSync('app/expense-ledger.tsx', 'utf8');

  it('keeps the month on screen, dimmed, until the next is in, and keeps months for a minute', () => {
    expect(screen).toContain('placeholderData: keepPreviousData, staleTime: 60_000, retry: 1');
    expect(screen).toContain('opacity: isPlaceholderData ? 0.5 : 1');
  });

  it('fetches the months either side ahead', () => {
    expect(screen).toContain('for (const delta of [-1, 1]) {');
    expect(screen).toContain('queryFn: () => getDashboardExpenseLedger(params),');
  });

  it('searches once typing pauses, not on every letter', () => {
    expect(screen).toContain('setTimeout(() => setSearched(search.trim()), 350)');
    expect(screen).toContain('...(searched ? { q: searched } : {})');
  });
});
