import { describe, expect, it } from 'vitest';
import { buildPostings, type PostingContext, type PreviewLine } from '@/lib/mpesaImport';
import { savePosting, type PostingApi } from '@/lib/savePosting';

const ctx: PostingContext = { accountId: 9, userId: 'u1', isShared: false, today: '2026-09-25', chargeCategory: 'Bank charges' };
const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: 0, status: 'ready', reason: null, receipt: 'TESTPOST01', direction: 'out', type: 'person_payment', amount: 1000,
  description: 'Sample Person', date: '2026-09-02', fee: 25, mpesaBalance: 0, alreadyRecorded: null, ...over,
});

// One place decides how a line is recorded and how its charge is tied to it, for both apps.
function fakeApi() {
  const calls: Array<[string, Record<string, unknown>]> = [];
  let next = 100;
  const api: PostingApi = {
    deposit: async (data) => { calls.push(['deposit', data as Record<string, unknown>]); return { id: (next += 1) }; },
    disbursement: async (data) => { calls.push(['disbursement', data as Record<string, unknown>]); return { id: (next += 1) }; },
    bankToBank: async (data) => { calls.push(['bankToBank', data as Record<string, unknown>]); next += 2; return { outgoing: { id: next - 1 }, incoming: { id: next } }; },
    toSavings: async (data) => { calls.push(['toSavings', data as Record<string, unknown>]); return { id: (next += 1) }; },
    fromSavings: async (data) => { calls.push(['fromSavings', data as Record<string, unknown>]); return { id: (next += 1) }; },
  };
  return { api, calls };
}

describe('saving one line', () => {
  it('records a payment, then its charge tied to it', async () => {
    const { api, calls } = fakeApi();
    const built = buildPostings(line({}), { include: true, category: 'Food' }, ctx)!;
    const posted = await savePosting(built, api, 9);
    expect(calls.map(([name]) => name)).toEqual(['disbursement', 'disbursement']);
    expect(calls[1][1]).toMatchObject({ amount: 25, chargeForTransactionId: 101 });
    expect(posted).toEqual({ id: 101, feeFailed: false });
  });

  it('records money in with no charge', async () => {
    const { api, calls } = fakeApi();
    const built = buildPostings(line({ direction: 'in', type: 'person_receipt', fee: null }), { include: true, category: '' }, ctx)!;
    expect((await savePosting(built, api, 9)).id).toBe(101);
    expect(calls.map(([name]) => name)).toEqual(['deposit']);
  });

  it('records a move between accounts, and ties the charge to the M-Pesa side', async () => {
    const { api, calls } = fakeApi();
    const out = buildPostings(line({}), { include: true, category: '', transferTo: 4 }, ctx)!;
    await savePosting(out, api, 9);
    expect(calls.map(([name]) => name)).toEqual(['bankToBank', 'disbursement']);
    expect(calls[1][1]).toMatchObject({ chargeForTransactionId: 101 });
    const into = fakeApi();
    const inbound = buildPostings(line({ direction: 'in', type: 'bank_receipt', fee: null }), { include: true, category: '', transferTo: 4 }, ctx)!;
    expect((await savePosting(inbound, into.api, 9)).id).toBe(102);
  });

  it('records a savings transfer the right way round, with its charge', async () => {
    const { api, calls } = fakeApi();
    const into = buildPostings(line({}), { include: true, category: '', savingsGoalId: 2 }, ctx)!;
    await savePosting(into, api, 9);
    expect(calls.map(([name]) => name)).toEqual(['toSavings', 'disbursement']);
    const back = fakeApi();
    const outOf = buildPostings(line({ direction: 'in', type: 'person_receipt', fee: null }), { include: true, category: '', savingsGoalId: 2 }, ctx)!;
    await savePosting(outOf, back.api, 9);
    expect(back.calls.map(([name]) => name)).toEqual(['fromSavings']);
  });

  it('reports a charge that did not save without undoing the entry', async () => {
    const { api } = fakeApi();
    let n = 0;
    const flaky: PostingApi = { ...api, disbursement: async (data) => { n += 1; if (n === 2) throw new Error('nope'); return api.disbursement(data); } };
    const built = buildPostings(line({}), { include: true, category: 'Food' }, ctx)!;
    expect(await savePosting(built, flaky, 9)).toMatchObject({ feeFailed: true });
  });

  it('lets an entry that fails throw, so the caller can say which and why', async () => {
    const { api } = fakeApi();
    const broken: PostingApi = { ...api, disbursement: async () => { throw new Error('already recorded'); } };
    const built = buildPostings(line({}), { include: true, category: 'Food' }, ctx)!;
    await expect(savePosting(built, broken, 9)).rejects.toThrow('already recorded');
  });
});
