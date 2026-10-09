import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// "Need to be able to edit" (9 Oct 2026): tapping a Search result opened only
// the tab it lives on. An expense or bank entry now opens itself to edit.
const screen = readFileSync('app/(tabs)/search.tsx', 'utf8');
const route = readFileSync('../api-server/src/routes/ai.ts', 'utf8');

describe('a Search result opens to edit', () => {
  it('a bank entry opens on Bank, on its own account, and comes back to Search', () => {
    expect(screen).toContain("if (kind === 'bank') return `/(tabs)/bank?editTx=${id}${accountId ? `&accountId=${accountId}` : ''}&opened=${Date.now()}&returnTo=${encodeURIComponent('/(tabs)/search')}`;");
    expect(route).toContain('accountId: jointAccountTxTable.accountId,');
  });

  it('an expense opens its edit form', () => {
    expect(screen).toContain("if (kind === 'expenses') return getExpenseEditHref({ id, date: date ?? '' });");
    expect(screen).toContain('router.push(destinationFor(item) as never)');
  });
});

describe('opening from Search is quick, works twice, and shows the edit', () => {
  const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
  const saved = readFileSync('lib/showSavedEdit.ts', 'utf8');

  it('opens the form from the one entry, not after the whole account loads', () => {
    expect(readFileSync('../api-server/src/routes/joint-account.ts', 'utf8')).toContain('router.get("/joint-account/entry/:id"');
    expect(bank).toContain('customFetch<{ transaction: Tx; charges: Tx[] }>(`/api/joint-account/entry/${Number(editTx)}`)');
    // Its own fee is found without the full list, so editing changes that fee instead of adding one.
    expect(bank).toContain('[...(data?.transactions ?? []), ...quickRows.current].find((row) => row.chargeForTransactionId === tx.id)');
  });

  it('the same entry tapped a second time opens again', () => {
    expect(bank).toContain("const editLink = editTx ? `${editTx}:${opened ?? ''}` : null;");
    expect(bank).not.toContain('handledEditTx.current = editTx;');
  });

  it('an edit made from Search shows in its results on the way back', () => {
    expect(saved).toContain("['workspace-search'],");
  });
});
