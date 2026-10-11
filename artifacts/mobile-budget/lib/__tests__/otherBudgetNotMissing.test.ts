import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixPlan, type DifferenceSpan } from '../mpesaLiveBalance';
import { leftoverOf, needsYou } from '../reconcileLeftover';
import { withOtherBudgets } from '../otherBudgets';

// "check again. there are messages still left" (11 Oct 2026): 22 payments already
// saved in another of the person's budgets were brought in, left unticked by the
// import so not counted twice, and asked for again on every visit to Home.
describe('a payment saved in another of your budgets is accounted for', () => {
  const span = (missing: DifferenceSpan['missing']): DifferenceSpan => ({ from: '2026-04-01', to: '2026-04-01', change: -500, missing, extra: [], redated: [] });

  it('is neither brought in again nor moved, and Home has nothing to ask', () => {
    const spans = [span([{ receipt: 'TD4AAA0001', day: '2026-04-01', savedIn: 'Lydiah and Chege', savedOn: null, otherBudget: true }])];
    const plan = fixPlan(spans);
    expect(plan.bringIn).toBeNull();
    expect(plan.move).toEqual([]);
    expect(needsYou(leftoverOf(spans))).toBe(false);
  });

  it('still brings in one that is nowhere, beside it', () => {
    const plan = fixPlan([span([
      { receipt: 'TD4AAA0001', day: '2026-04-01', savedIn: 'Lydiah and Chege', savedOn: null, otherBudget: true },
      { receipt: 'TD4BBB0002', day: '2026-04-01', savedIn: null, savedOn: null },
    ])]);
    expect(plan.bringIn?.receipts).toEqual(['TD4BBB0002']);
  });

  it('is found by asking which codes another budget has, and marked there', async () => {
    const answer = { result: { spans: [span([
      { receipt: 'TD4AAA0001', day: '2026-04-01', savedIn: null, savedOn: null },
      { receipt: 'TD4BBB0002', day: '2026-04-01', savedIn: null, savedOn: null },
    ])] } };
    const asked: string[][] = [];
    const marked = await withOtherBudgets(answer, async (codes) => { asked.push(codes); return [{ receipt: 'TD4AAA0001', budget: 'Lydiah and Chege' }]; });
    expect(asked).toEqual([['TD4AAA0001', 'TD4BBB0002']]);
    expect(marked.result.spans[0].missing).toEqual([
      { receipt: 'TD4AAA0001', day: '2026-04-01', savedIn: 'Lydiah and Chege', savedOn: null, otherBudget: true },
      { receipt: 'TD4BBB0002', day: '2026-04-01', savedIn: null, savedOn: null },
    ]);
    expect(fixPlan(marked.result.spans).bringIn?.receipts).toEqual(['TD4BBB0002']);
    // The lookup failing changes nothing.
    expect(await withOtherBudgets(answer, async () => { throw new Error('offline'); })).toBe(answer);
  });

  it('asks the route that counts every budget the person belongs to, and says how many it found', () => {
    const lib = readFileSync('lib/otherBudgets.ts', 'utf8');
    expect(lib).toContain("'/api/possible-duplicates/in-my-budgets'");
    expect(lib).toContain('check missing${codes.length} in-other-budgets${found.size}');
    const server = readFileSync('../api-server/src/lib/possible-duplicates.ts', 'utf8');
    const member = server.slice(server.indexOf('export async function receiptsInMemberBudgets'));
    expect(member).toContain('JOIN group_memberships m ON m.group_id = t.group_id AND m.user_id = ${userId}');
    // Whoever owns it: no owner condition.
    expect(member).not.toContain("role = 'owner'");
  });

  it('is used by Home and Find the difference, and said where it is', () => {
    expect(readFileSync('lib/autoReconcile.ts', 'utf8')).toContain("const ask = async () => withOtherBudgets(await customFetch<Answer>('/api/mpesa/difference', {");
    const screen = readFileSync('app/mpesa-difference.tsx', 'utf8');
    expect(screen).toContain('setAnswer(await withOtherBudgets(await retrySave(');
    expect(screen).toContain('another of your budgets. Left there, so it is not counted twice.');
    // The import routes still never read who is asking.
    expect(readFileSync('../api-server/src/routes/mpesa-import.ts', 'utf8')).not.toContain('receiptsElsewhere');
  });
});
