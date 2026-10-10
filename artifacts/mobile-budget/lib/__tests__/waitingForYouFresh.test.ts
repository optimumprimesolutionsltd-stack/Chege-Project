import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(__dirname, path), 'utf8');

// "Waiting for you does nothing. it just opens a tab and there is nothing to do
// there ... why identify problems you cannot solve?" (10 Oct 2026)
describe('Waiting for you only lists what still needs the person', () => {
  it('checks a count that needs them again after minutes, not hours', () => {
    const hook = read('../../hooks/useAutoReconcile.ts');
    expect(hook).toContain('export const RECHECK_WAITING_MS = 10 * 60 * 1000;');
    expect(hook).toContain('(needsYou(kept.left) ? RECHECK_WAITING_MS : RECONCILE_EVERY_MS)');
    expect(hook).toContain('staleTime: RECHECK_WAITING_MS,');
  });

  it('never opens Find the difference on a blank screen, and says when nothing needs them', () => {
    const screen = read('../../app/mpesa-difference.tsx');
    expect(screen).toContain('testID="mpesa-difference-nothing"');
    expect(screen).toContain('Nothing here needs you. Anything Home listed has been sorted.');
    expect(screen).toContain('testID="mpesa-difference-home"');
  });
});
