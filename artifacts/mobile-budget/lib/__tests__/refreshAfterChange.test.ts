import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { afterQuiet } from '@/lib/refreshAfterChange';

// "Changes made in the app are not getting effected in other areas": an income
// source changed on a deposit still showed its old name in Reports.
describe('afterQuiet', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('refreshes once after a burst of changes, not once per change', () => {
    const refresh = vi.fn();
    const trigger = afterQuiet(refresh, 250);
    trigger(); trigger(); trigger();
    vi.advanceTimersByTime(249);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes again for the next change', () => {
    const refresh = vi.fn();
    const trigger = afterQuiet(refresh, 100);
    trigger();
    vi.advanceTimersByTime(100);
    trigger();
    vi.advanceTimersByTime(100);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe('both apps refresh everything after any successful change', () => {
  const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  it.each([
    ['app/_layout.tsx'],
    ['../family-budget/src/App.tsx'],
  ])('%s', (file) => {
    expect(read(file)).toContain('new MutationCache({ onSuccess: () => refreshEverything() })');
  });

  // The phone's tab screens stay mounted, so it refetches the whole-history
  // lists only once their screen is in view (lib/refreshAfterSave, lag audit
  // 7 Oct 2026); everything else refreshes at once, as on the web.
  it('the web refetches everything; the phone holds back only the whole-history lists', () => {
    expect(read('../family-budget/src/App.tsx')).toContain('void queryClient.invalidateQueries();');
    expect(read('app/_layout.tsx')).toContain('const refreshEverything = afterQuiet(() => refreshAfterSave(queryClient));');
  });
});
