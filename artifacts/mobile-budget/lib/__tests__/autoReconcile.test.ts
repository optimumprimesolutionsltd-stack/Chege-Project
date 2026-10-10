import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leftoverOf, leftoverText, needsYou } from '@/lib/reconcileLeftover';
import type { DifferenceSpan } from '@/lib/mpesaLiveBalance';

// "Find the difference... needs to resolve itself 100 percent and be clean,
// otherwise a user is troubled" (10 Oct 2026).
const span = (over: Partial<DifferenceSpan>): DifferenceSpan => ({
  from: '2026-03-01', to: '2026-03-02', change: 500, missing: [], extra: [], redated: [], amounts: [], ...over,
});

describe('what is left for the person', () => {
  it('only entries no message has, and payments no entry has', () => {
    const left = leftoverOf([
      span({ extra: [{ id: 1, date: '2026-03-01', amount: -200, description: 'Typed by hand', receipt: null }] }),
      span({ from: '2026-04-01', to: '2026-04-03', missing: [{ receipt: 'TESTMISS1', day: '2026-04-02', savedIn: null, savedOn: null }] }),
      // Saved to another account and saved under another day are fixed by themselves: not left.
      span({ missing: [{ receipt: 'TESTMOVE1', day: '2026-03-01', savedIn: 'Equity', savedOn: '2026-03-01' }], redated: [{ id: 2, receipt: 'TESTDAY1', messageDay: '2026-03-01', savedDate: '2026-03-02', amount: -50, description: 'Shop' }] }),
    ]);
    expect(left).toEqual({ extra: 1, missing: { count: 1, from: '2026-04-01', to: '2026-04-03' } });
    expect(needsYou(left)).toBe(true);
    expect(leftoverText(left)).toBe('1 M-Pesa payment to bring in \u00b7 1 entry M-Pesa never had');
  });

  it('nothing at all when the sure fixes were enough', () => {
    const left = leftoverOf([span({ redated: [{ id: 2, receipt: 'TESTDAY1', messageDay: '2026-03-01', savedDate: '2026-03-02', amount: -50, description: 'Shop' }] })]);
    expect(needsYou(left)).toBe(false);
  });
});

describe('the sure fixes are made with no question', () => {
  const lib = readFileSync('lib/autoReconcile.ts', 'utf8');
  it('starting balance, moves, wrong days and missing charges, then checks again', () => {
    expect(lib).toContain('const opening = openingBalanceFix(answer.result.startGap, answer.account.openingBalance);');
    expect(lib).toContain("body: JSON.stringify({ move: plan.move, redate: plan.redate, charges: plan.charges }),");
    expect(lib).toContain('if (changed) answer = await ask();');
  });
  it('from Home, every six hours at most, never during an import save, only for who may change the budget', () => {
    const hook = readFileSync('hooks/useAutoReconcile.ts', 'utf8');
    expect(hook).toContain("if (getImportProgress()?.stage === 'saving') return kept?.left ?? null;");
    expect(hook).toContain('enabled: groupId != null && canManage,');
    expect(lib).toContain('export const RECONCILE_EVERY_MS = 6 * 60 * 60 * 1000;');
    expect(readFileSync('app/(tabs)/index.tsx', 'utf8')).toContain('const reconcileLeft = useAutoReconcile(group?.id, canManageBudget, onScreen);');
  });
});
