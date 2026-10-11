import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initialChoices, twinNotes, untickElsewhere, type PreviewLine } from '../mpesaImport';
import { fixPlan, type DifferenceSpan } from '../mpesaLiveBalance';

// "The four entries are removed from the app but still come back when i import
// pdf statement" (11 Oct 2026).
describe('a payment the person deleted is not brought back by itself', () => {
  const line = (over: Partial<PreviewLine> = {}): PreviewLine => ({ index: 0, status: 'ready', reason: null, receipt: 'TK1AAA0001', direction: 'out', type: 'person_payment', amount: 500, description: 'Someone', date: '2026-05-01', fee: null, mpesaBalance: null, alreadyRecorded: null, ...over });

  it('starts unticked on a statement, saying why', () => {
    const removed = line({ removedBefore: true });
    expect(initialChoices([removed], [], ['Food'], '', {}, true)[0].include).toBe(false);
    expect(twinNotes(removed)).toContain('You removed this from Jamvi before, so it is left unticked. Tick it to bring it back.');
    expect(initialChoices([line()], [], ['Food'], '', {}, true)[0].include).toBe(true);
  });

  it('is unticked when found after the choices were made, unless the person already chose', () => {
    const removed = line({ removedBefore: true });
    expect(untickElsewhere([removed], { 0: { include: true, category: 'Food' } as never })[0].include).toBe(false);
    expect(untickElsewhere([removed], { 0: { include: true, category: 'Food', confirmed: true } as never })[0].include).toBe(true);
  });

  it('is left out of what Home asks to bring in', () => {
    const span: DifferenceSpan = { from: '2026-05-01', to: '2026-05-01', change: -500, missing: [{ receipt: 'TK1AAA0001', day: '2026-05-01', savedIn: null, savedOn: null, removed: true }], extra: [], redated: [] };
    expect(fixPlan([span]).bringIn).toBeNull();
  });

  it('is kept by the server when an entry is deleted, and named by both checks', () => {
    const lib = readFileSync('../api-server/src/lib/removed-receipts.ts', 'utf8');
    expect(lib).toContain('PRIMARY KEY ("group_id", "receipt")');
    const route = readFileSync('../api-server/src/routes/joint-account.ts', 'utf8');
    expect(route).toContain('await rememberRemoved(groupId, deleteResult.deleted.mpesaReceipt);');
    const imports = readFileSync('../api-server/src/routes/mpesa-import.ts', 'utf8');
    expect(imports).toContain('const removed = (await removedAmong(groupId, codes)).filter((code) => !recordedCodes.has(code));');
    expect(imports).toContain('elsewhere.set(code, { account: "", date: "", removed: true });');
    // The import routes still never read who is asking.
    expect(imports).not.toContain('req.user');
  });
});
