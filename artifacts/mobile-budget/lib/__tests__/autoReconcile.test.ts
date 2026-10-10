import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { leftoverOf, leftoverText, needsYou } from '@/lib/reconcileLeftover';

vi.mock('@workspace/api-client-react', () => ({ customFetch: vi.fn() }));
vi.mock('@/lib/mpesaSms', () => ({ canReadSms: () => false, readMpesaRows: vi.fn() }));
const { fixUntilDone, MAX_ROUNDS } = await import('@/lib/autoReconcile');
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
    expect(lib).toContain('answer = await ask();');
  });
  it('from Home, every six hours at most, never during an import save, only for who may change the budget', () => {
    const hook = readFileSync('hooks/useAutoReconcile.ts', 'utf8');
    expect(hook).toContain("if (getImportProgress()?.stage === 'saving') return kept?.left ?? null;");
    // A failed run is not kept for six hours; an import that saved, or leaving Find the difference, checks again.
    expect(hook).toMatch(/\} catch \{\s+return kept\?\.left \?\? null;/);
    expect(hook).toContain('if (importDone) reconcileAgain(queryClient, groupId);');
    expect(readFileSync('app/mpesa-difference.tsx', 'utf8')).toContain('return () => reconcileAgain(queryClient, groupId);');
    expect(hook).toContain('enabled: groupId != null && canManage,');
    expect(lib).toContain('export const RECONCILE_EVERY_MS = 6 * 60 * 60 * 1000;');
    expect(readFileSync('app/(tabs)/index.tsx', 'utf8')).toContain('const reconcileLeft = useAutoReconcile(group?.id, canManageBudget, onScreen);');
  });
});

// "Find the difference is not finishing the work" (10 Oct 2026): the server lists
// 60 places a check, and one round of fixes stopped at those.
describe('fixes round after round until nothing sure is left', () => {
  const account = { id: 7, name: 'M-Pesa', openingBalance: 0 };
  const redated = (id: number) => span({ from: `2026-03-${String(id).padStart(2, '0')}`, redated: [{ id, receipt: `TESTDAY${id}`, messageDay: '2026-03-01', savedDate: '2026-03-02', amount: -50, description: 'Shop' }] });
  const extra = span({ extra: [{ id: 99, date: '2026-05-01', amount: -200, description: 'Typed by hand', receipt: null }] });

  it('keeps going past the first page, then reports only what needs the person', async () => {
    // Three pages of wrong days, fixed one page per round, then one entry only the person can answer.
    const pages = [[redated(1)], [redated(2)], [redated(3)], [extra]];
    let asked = 0;
    const fixed: number[][] = [];
    const left = await fixUntilDone(
      async () => ({ account, result: { from: '2026-01-01', startGap: 0, spans: pages[Math.min(asked++, pages.length - 1)], moreSpans: asked < 4 ? 60 : 0 } }),
      { setOpening: vi.fn(), fix: async (plan) => { fixed.push(plan.redate.map((one) => one.id)); }, chargeOf: () => null },
    );
    expect(fixed).toEqual([[1], [2], [3]]);
    expect(left).toEqual({ extra: 1, missing: null });
  });

  it('stops when a round changes nothing, and says there is more past the list', async () => {
    const fix = vi.fn(async () => {});
    const left = await fixUntilDone(
      async () => ({ account, result: { from: '2026-01-01', startGap: 0, spans: [redated(1), extra], moreSpans: 5 } }),
      { setOpening: vi.fn(), fix, chargeOf: () => null },
    );
    expect(fix).toHaveBeenCalledTimes(1);
    expect(left.more).toBe(true);
    expect(leftoverText(left)).toBe('1 entry M-Pesa never had, and more after');
  });

  it('never more than MAX_ROUNDS', async () => {
    let n = 0;
    const fix = vi.fn(async () => {});
    await fixUntilDone(async () => ({ account, result: { from: '2026-01-01', startGap: 0, spans: [redated(++n)] } }), { setOpening: vi.fn(), fix, chargeOf: () => null });
    expect(fix).toHaveBeenCalledTimes(MAX_ROUNDS);
  });
});
