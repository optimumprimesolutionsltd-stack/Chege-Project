import { describe, expect, it } from 'vitest';
import { savePosting, type Built, type PostingApi } from '@/lib/savePosting';
import { saveBuilt, saveItem, RouteRefusal, SIGNED_OUT } from '../../../api-server/src/lib/import-save-posting';

/**
 * The server saves an import with its own copy of lib/savePosting. Every kind
 * of line must reach the same routes, with the same bodies, in the same budget,
 * and tie its charge to the same entry, as when the phone saved it.
 */
type Call = { path: string; body: unknown; groupId: number };

const ROUTES: Record<string, string> = {
  deposit: '/api/joint-account/deposit',
  disbursement: '/api/joint-account/disbursement',
  bankToBank: '/api/joint-account/transfers/bank-to-bank',
  toSavings: '/api/joint-account/transfers/to-savings',
  fromSavings: '/api/joint-account/transfers/from-savings',
};

const HERE = 3;
const MPESA = 11;

function phoneCalls(failCharge = false) {
  const calls: Call[] = [];
  let next = 100;
  const made = (path: string, body: unknown, groupId = HERE) => {
    calls.push({ path, body, groupId });
    if (failCharge && (body as { chargeForTransactionId?: number; amount?: number }).amount === 30) return Promise.reject(new Error('no'));
    return Promise.resolve({ id: next++ });
  };
  const api: PostingApi = {
    deposit: (data) => made(ROUTES.deposit, data),
    disbursement: (data) => made(ROUTES.disbursement, data),
    bankToBank: (data) => {
      calls.push({ path: ROUTES.bankToBank, body: data, groupId: HERE });
      return Promise.resolve({ outgoing: { id: next++ }, incoming: { id: next++ } });
    },
    toSavings: (data) => made(ROUTES.toSavings, data),
    fromSavings: (data) => made(ROUTES.fromSavings, data),
    otherBudget: (groupId, direction, data) => made(direction === 'in' ? ROUTES.deposit : ROUTES.disbursement, data, groupId),
  };
  return { calls, api };
}

function serverCalls(failCharge = false) {
  const calls: Call[] = [];
  let next = 100;
  const call = async (path: string, body: unknown, groupId: number) => {
    calls.push({ path, body, groupId });
    if (failCharge && (body as { amount?: number }).amount === 30) throw new RouteRefusal(400, { error: 'no' });
    if (path === ROUTES.bankToBank) return { outgoing: { id: next++ }, incoming: { id: next++ } };
    return { id: next++ };
  };
  return { calls, call };
}

const fee = { amount: 30, description: 'Charge', date: '2026-10-01', accountId: MPESA, expenseCategory: 'M-Pesa charges' };
const main = { amount: 1000, description: 'X', date: '2026-10-01', accountId: MPESA, mpesaReceipt: 'ABC' };

const CASES: Array<[string, Built]> = [
  ['spending with a charge', { kind: 'disbursement', main, fee } as unknown as Built],
  ['money in', { kind: 'deposit', main, fee: null } as unknown as Built],
  ['to savings', { kind: 'savings', direction: 'out', main, fee } as unknown as Built],
  ['from savings', { kind: 'savings', direction: 'in', main, fee: null } as unknown as Built],
  ['a move out of M-Pesa', { kind: 'transfer', main: { ...main, sourceAccountId: MPESA, destinationAccountId: 12 }, fee } as unknown as Built],
  ['a move into M-Pesa', { kind: 'transfer', main: { ...main, sourceAccountId: 12, destinationAccountId: MPESA }, fee } as unknown as Built],
  ['another budget, out', { kind: 'other-budget', groupId: 8, direction: 'out', main, fee } as unknown as Built],
  ['another budget, in', { kind: 'other-budget', groupId: 8, direction: 'in', main, fee: null } as unknown as Built],
];

describe('the server saves a line exactly as the phone did', () => {
  for (const [name, built] of CASES) {
    for (const failCharge of [false, true]) {
      it(`${name}${failCharge ? ', its charge refused' : ''}`, async () => {
        const phone = phoneCalls(failCharge);
        const server = serverCalls(failCharge);
        const phonePosted = await savePosting(built, phone.api, MPESA);
        const serverPosted = await saveBuilt(built as never, server.call, HERE, MPESA);
        expect(server.calls).toEqual(phone.calls);
        expect(serverPosted).toEqual(phonePosted);
      });
    }
  }
});

describe('what the server says an entry became', () => {
  const item = { key: 4, built: { kind: 'disbursement', main, fee: null } as never };
  const refusing = (status: number, body: unknown) => async () => { throw new RouteRefusal(status, body); };

  it('a repeat, a lapsed plan, a sign-out, or the route\'s own reason', async () => {
    expect(await saveItem(item, refusing(409, { error: 'ABC is already recorded, on 2026-10-01 as "X".' }), HERE, MPESA)).toEqual({ key: 4, outcome: 'repeat' });
    expect(await saveItem(item, refusing(402, { error: 'Trial ended' }), HERE, MPESA)).toEqual({ key: 4, outcome: 'lapsed' });
    expect(await saveItem(item, refusing(401, { error: 'Unauthorized' }), HERE, MPESA)).toEqual({ key: 4, outcome: 'failed', why: SIGNED_OUT });
    expect(await saveItem(item, refusing(400, { error: 'Choose a category' }), HERE, MPESA)).toEqual({ key: 4, outcome: 'failed', why: 'Choose a category' });
    const page = await saveItem(item, refusing(502, null), HERE, MPESA);
    expect(page.outcome).toBe('failed');
    expect(JSON.stringify(page)).not.toMatch(/502|<html/i);
  });

  it('saved, with the entry made', async () => {
    expect(await saveItem(item, async () => ({ id: 77 }), HERE, MPESA)).toEqual({ key: 4, outcome: 'saved', id: 77 });
  });
});
