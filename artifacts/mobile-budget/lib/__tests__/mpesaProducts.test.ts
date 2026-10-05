import { describe, expect, it } from 'vitest';
import { buildPostings, initialChoices, isConfirmedToSave, NOT_SURE_CATEGORY, problemWith, refreshSuggestions, type Choice, type PreviewLine } from '../mpesaImport';
import { findLenderParty, lendersNeeded, withLenderDebts } from '../mpesaDebts';
import { findSavingsGoal, isSavingsAccount, LENDERS, ledgersToMake, loanOf, productCategory, productOf, SAVINGS_ACCOUNTS, savingsNeeded, savingsOf, withSavingsAccounts } from '../mpesaProducts';
import { statementLines } from '../statementImport';

const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: 0, status: 'ready', reason: null, receipt: 'TESTPROD01', direction: 'out', type: 'paybill_payment', amount: 50,
  description: 'Shop', date: '2026-09-02', fee: null, mpesaBalance: 0, alreadyRecorded: null, ...over,
});

// Safaricom's own products need nobody's answer: asked for 5 Oct 2026, after a
// first statement showed airtime among a thousand "Not sure yet" lines. Each has
// its own ledger under the built-in M-Pesa heading.
describe('Safaricom products are recognised, each with its ledger', () => {
  it.each([
    ['a pasted airtime purchase', { type: 'airtime_purchase', description: 'Airtime' }, 'Airtime'],
    ["a statement's Airtime Purchase", { type: 'other', description: 'Airtime Purchase' }, 'Airtime'],
    ["a statement's Recharge for Customer", { type: 'other', description: 'Recharge for Customer' }, 'Airtime'],
    ['data bundles', { description: 'SAFARICOM DATA BUNDLES (Talkmore)' }, 'Data bundles'],
    ['a Tunukiwa offer', { description: 'Safaricom Offers (Tunukiwa)' }, 'Data bundles'],
    ['postpaid bundles', { description: 'SAMPLE POSTPAID BUNDLES' }, 'Data bundles'],
    ["a statement's Buy Bundles Online", { type: 'other', description: 'Buy Bundles Online' }, 'Data bundles'],
    ['Home Fibre', { description: 'Safaricom Home Fibre (12345)' }, 'Home Fibre'],
    ['a bundle renamed by the person', { description: 'My data', original: 'SAFARICOM DATA BUNDLES' }, 'Data bundles'],
  ] as const)('%s', (_name, over, ledger) => {
    expect(productOf(line(over as Partial<PreviewLine>))?.ledger).toBe(ledger);
  });

  it.each([
    ['a Safaricom shop', { description: 'Safaricom Shop Moi Avenue' }],
    ['M-Shwari savings', { type: 'other', description: 'M-Shwari Deposit' }],
    ['KCB M-PESA savings', { type: 'other', description: 'KCB M-PESA Deposit' }],
    ['an ordinary shop', { description: 'Naivas Supermarket' }],
  ] as const)('but not %s', (_name, over) => {
    expect(productOf(line(over as Partial<PreviewLine>))).toBeNull();
  });

  it('only for money out', () => {
    expect(productOf(line({ direction: 'in', type: 'airtime_purchase', description: 'Airtime' }))).toBeNull();
  });

  it('spelt the way the budget spells the ledger', () => {
    const airtime = productOf(line({ type: 'airtime_purchase', description: 'Airtime' }))!;
    expect(productCategory(airtime, ['Food', 'airtime'])).toBe('airtime');
    expect(productCategory(airtime, ['Food'])).toBe('Airtime');
  });
});

describe('a product line is filed and confirmed by Jamvi', () => {
  const names = ['Food', 'M-Pesa charges', 'Fuliza charges', 'Airtime', 'Data bundles', 'Home Fibre'];
  const lines = [
    line({ index: 0, type: 'airtime_purchase', description: 'Airtime' }),
    line({ index: 1, receipt: 'TESTPROD02', description: 'Naivas Supermarket' }),
    line({ index: 2, receipt: 'TESTPROD03', type: 'transaction_charge', description: 'M-Pesa charge' }),
    line({ index: 3, receipt: 'TESTPROD04', description: 'SAFARICOM DATA BUNDLES' }),
  ];

  it('so it saves without anybody confirming it, while an unknown shop waits', () => {
    const choices = initialChoices(lines, [], names, 'M-Pesa charges');
    expect(choices[0]).toMatchObject({ category: 'Airtime', auto: true, confirmed: true });
    expect(isConfirmedToSave(lines[0], choices[0])).toBe(true);
    expect(choices[1]).toMatchObject({ category: NOT_SURE_CATEGORY });
    expect(isConfirmedToSave(lines[1], choices[1])).toBe(false);
    expect(choices[2]).toMatchObject({ category: 'M-Pesa charges', confirmed: true });
    expect(choices[3]).toMatchObject({ category: 'Data bundles', confirmed: true });
  });

  it('follows where the person filed airtime before', () => {
    const history = [{ type: 'disbursement', description: 'Airtime', expenseCategory: 'Phone' }];
    expect(initialChoices(lines, history, [...names, 'Phone'])[0]).toMatchObject({ category: 'Phone', confirmed: true });
  });

  it('but not when that was only Not sure yet', () => {
    const history = [{ type: 'disbursement', description: 'Airtime', expenseCategory: NOT_SURE_CATEGORY }];
    expect(initialChoices(lines, history, names)[0]).toMatchObject({ category: 'Airtime', confirmed: true });
  });

  it('keeps its filing when suggestions are worked out again', () => {
    const choices = initialChoices(lines, [], names);
    expect(refreshSuggestions(lines, choices, [], names)[0]).toMatchObject({ category: 'Airtime', confirmed: true });
  });

  it('a group member, who cannot record payments out, still starts with it unticked', () => {
    expect(initialChoices(lines, [], names, '', {}, false)[0].include).toBe(false);
  });
});

describe('a ledger the budget lacks is made before the save', () => {
  const lines = [line({ index: 0, type: 'airtime_purchase', description: 'Airtime' }), line({ index: 1, receipt: 'TESTPROD05', description: 'Safaricom Home Fibre' })];

  it('only those a ticked line is filed into', () => {
    const choices = initialChoices(lines, [], ['Food']);
    expect(ledgersToMake(lines, choices, ['Food'])).toEqual(['Airtime', 'Home Fibre']);
    expect(ledgersToMake(lines, choices, ['Food', 'airtime'])).toEqual(['Home Fibre']);
  });

  it('not for an unticked line or one sent elsewhere', () => {
    const choices = initialChoices(lines, [], ['Food']);
    expect(ledgersToMake(lines, { 0: { ...choices[0], include: false }, 1: { ...choices[1], debt: { kind: 'lend', partyId: 1 } } }, ['Food'])).toEqual([]);
  });
});

// "for loans to have their independent names": each lender is its own entry in Who owes who.
describe('loans go to their own lender', () => {
  it.each([
    [{ type: 'fuliza_borrowed', direction: 'in' }, 'Fuliza', 'borrowed'],
    [{ type: 'fuliza_repaid', direction: 'out' }, 'Fuliza', 'pay-back'],
    [{ type: 'other', direction: 'in', description: 'M-Shwari Loan' }, 'M-Shwari', 'borrowed'],
    [{ type: 'other', direction: 'out', description: 'M-Shwari Loan Repayment' }, 'M-Shwari', 'pay-back'],
    [{ type: 'other', direction: 'in', description: 'KCB M-PESA Loan Request' }, 'KCB M-PESA', 'borrowed'],
    [{ type: 'other', direction: 'out', description: 'KCB M-PESA Loan Repayment' }, 'KCB M-PESA', 'pay-back'],
    [{ type: 'person_receipt', direction: 'in', description: 'Received from Hustler Fund' }, 'Hustler Fund', 'borrowed'],
    [{ type: 'paybill_payment', direction: 'out', description: 'Hustler Fund (Repayment)' }, 'Hustler Fund', 'pay-back'],
  ] as const)('%o', (over, name, kind) => {
    const loan = loanOf(line(over as Partial<PreviewLine>));
    expect(loan?.lender.name).toBe(name);
    expect(loan?.kind).toBe(kind);
  });

  it('savings moves are not loans', () => {
    expect(loanOf(line({ type: 'other', description: 'M-Shwari Deposit' }))).toBeNull();
    expect(loanOf(line({ type: 'other', direction: 'in', description: 'KCB M-PESA Withdraw' }))).toBeNull();
  });

  it('are found in Who owes who by name, Fuliza under its old name too', () => {
    const parties = [{ id: 1, name: 'Safaricom PLC' }, { id: 2, name: 'M-Shwari' }, { id: 3, name: 'KCB M-Pesa' }];
    expect(LENDERS.map((lender) => findLenderParty(lender, parties)?.id ?? null)).toEqual([1, 2, 3, null]);
  });

  const lines = [
    line({ index: 0, type: 'other', direction: 'in', description: 'M-Shwari Loan', amount: 1000 }),
    line({ index: 1, receipt: 'TESTLOAN02', type: 'other', direction: 'out', description: 'M-Shwari Loan Repayment', amount: 1075 }),
    line({ index: 2, receipt: 'TESTLOAN03', type: 'other', direction: 'out', description: 'KCB M-PESA Loan Repayment', amount: 500 }),
  ];

  it('start filed and confirmed, with no income source and no category', () => {
    const choices = initialChoices(lines, [{ type: 'deposit', description: 'M-Shwari Loan', incomeSourceId: 9 }], ['Food']);
    expect(choices[0]).toMatchObject({ include: true, confirmed: true, incomeSourceId: null });
    expect(choices[1]).toMatchObject({ category: '', confirmed: true });
    expect(isConfirmedToSave(lines[1], choices[1])).toBe(true);
  });

  it('each needs its own lender, and is linked to it', () => {
    const choices = initialChoices(lines, [], ['Food']);
    expect(lendersNeeded(lines, choices).map((lender) => lender.name)).toEqual(['M-Shwari', 'KCB M-PESA']);
    const linked = withLenderDebts(lines, choices, { mshwari: 2, kcb: 3 });
    expect(linked[0].debt).toEqual({ kind: 'borrowed', partyId: 2 });
    expect(linked[1].debt).toEqual({ kind: 'pay-back', partyId: 2 });
    expect(linked[2].debt).toEqual({ kind: 'pay-back', partyId: 3 });
  });

  it('saves a drawing as borrowing and a repayment as the debt going down, not spending', () => {
    const ctx = { accountId: 1, userId: 'u', isShared: false, today: '2026-10-05', chargeCategory: '' };
    const repay: Choice = { include: true, category: '', debt: { kind: 'pay-back', partyId: 2 } };
    expect(problemWith(lines[1], repay)).toBeNull();
    const repaid = buildPostings(lines[1], repay, ctx) as { main: Record<string, unknown> };
    expect(repaid.main).toMatchObject({ settlesContributorId: 2 });
    expect(repaid.main.expenseCategory).toBeUndefined();
    const drawn = buildPostings(lines[0], { include: true, category: '' }, ctx) as { main: Record<string, unknown> };
    expect(drawn.main).toMatchObject({ isBorrowing: true });
  });
});

describe('the statement reader names airtime rows', () => {
  const row = (details: string) => ({ receipt: 'TESTAIR001', time: '2026-09-01 08:00:00', details, status: 'Completed', paidIn: null, withdrawn: 20, balance: 100 });

  it.each(['Airtime Purchase', 'Recharge for Customer'])('%s', (details) => {
    const [first] = statementLines([row(details)]).lines;
    expect(first).toMatchObject({ type: 'airtime_purchase', description: 'Airtime', direction: 'out' });
  });

  it('and leaves Buy Bundles Online as worded, for Data bundles', () => {
    const [first] = statementLines([row('Buy Bundles Online')]).lines;
    expect(first).toMatchObject({ type: 'other', description: 'Buy Bundles Online' });
    expect(productOf(first)?.ledger).toBe('Data bundles');
  });
});

// "we have a savings section": M-Shwari, KCB M-PESA, Ziidi and Mali are accounts in it.
// Money moved in leaves M-Pesa and money taken out comes back - never spending or income.
describe('savings products go to their own account in Savings', () => {
  it.each([
    [{ type: 'other', direction: 'out', description: 'M-Shwari Deposit' }, 'M-Shwari', true],
    [{ type: 'other', direction: 'in', description: 'M-Shwari Withdraw' }, 'M-Shwari', false],
    [{ type: 'other', direction: 'out', description: 'KCB M-PESA Deposit' }, 'KCB M-PESA', true],
    [{ type: 'other', direction: 'in', description: 'KCB M-PESA Withdraw' }, 'KCB M-PESA', false],
    [{ type: 'person_payment', direction: 'out', description: 'ZIIDI' }, 'Ziidi', true],
    [{ type: 'person_receipt', direction: 'in', description: 'Received from Ziidi' }, 'Ziidi', false],
    [{ type: 'paybill_payment', direction: 'out', description: 'M-PESA Mali (Savings)' }, 'Mali', true],
  ] as const)('%o', (over, name, into) => {
    expect(savingsOf(line(over as Partial<PreviewLine>))).toMatchObject({ account: { name }, into });
  });

  it.each([
    ['an M-Shwari loan', { type: 'other', direction: 'in', description: 'M-Shwari Loan' }],
    ['a shop called Mali', { description: 'Mali Hardware' }],
    ['an amount with cents, which savings cannot hold', { type: 'other', description: 'M-Shwari Deposit', amount: 100.5 }],
  ] as const)('but not %s', (_name, over) => {
    expect(savingsOf(line(over as Partial<PreviewLine>))).toBeNull();
  });

  const lines = [
    line({ index: 0, type: 'other', description: 'M-Shwari Deposit', amount: 2000 }),
    line({ index: 1, receipt: 'TESTSAV02', type: 'other', direction: 'in', description: 'M-Shwari Withdraw', amount: 500 }),
    line({ index: 2, receipt: 'TESTSAV03', type: 'other', description: 'KCB M-PESA Deposit', amount: 300 }),
  ];

  it('start filed and confirmed, with no category and no income source', () => {
    const choices = initialChoices(lines, [{ type: 'deposit', description: 'M-Shwari Withdraw', incomeSourceId: 4 }], ['Food']);
    expect(choices[0]).toMatchObject({ category: '', confirmed: true });
    expect(choices[1]).toMatchObject({ incomeSourceId: null, confirmed: true });
    expect(problemWith(lines[0], choices[0])).toBeNull();
  });

  it('each account is found by name, or needed; and its lines linked to it', () => {
    const goals = [{ id: 7, name: 'M-Shwari' }, { id: 8, name: 'Holiday' }];
    expect(findSavingsGoal(SAVINGS_ACCOUNTS[0], goals)?.id).toBe(7);
    expect(findSavingsGoal(SAVINGS_ACCOUNTS[1], goals)).toBeNull();
    const choices = initialChoices(lines, [], ['Food']);
    expect(savingsNeeded(lines, choices).map((account) => account.name)).toEqual(['M-Shwari', 'KCB M-PESA']);
    const linked = withSavingsAccounts(lines, choices, { mshwari: 7, kcb: 9 });
    expect(linked[0]).toMatchObject({ savingsGoalId: 7, category: '' });
    expect(linked[1]).toMatchObject({ savingsGoalId: 7, incomeSourceId: null });
    expect(linked[2]).toMatchObject({ savingsGoalId: 9 });
    expect(savingsNeeded(lines, linked)).toEqual([]);
  });

  it('saves as a move into or out of savings', () => {
    const ctx = { accountId: 1, userId: 'u', isShared: false, today: '2026-10-05', chargeCategory: '' };
    const linked = withSavingsAccounts(lines, initialChoices(lines, [], ['Food']), { mshwari: 7, kcb: 9 });
    expect(buildPostings(lines[0], linked[0], ctx)).toMatchObject({ kind: 'savings', direction: 'out', main: { goalId: 7, amount: 2000 } });
    expect(buildPostings(lines[1], linked[1], ctx)).toMatchObject({ kind: 'savings', direction: 'in', main: { goalId: 7, amount: 500 } });
  });

  it('a group member, who cannot move savings, starts with them unticked', () => {
    const choices = initialChoices(lines, [], ['Food'], '', {}, false);
    expect([choices[0].include, choices[1].include]).toEqual([false, false]);
  });

  it('an account is a savings entry with no target', () => {
    expect(isSavingsAccount({ targetAmount: 0 })).toBe(true);
    expect(isSavingsAccount({ targetAmount: 50000 })).toBe(false);
  });
});

// A statement worked through before this change comes back from its draft with the old
// choices: airtime on "Not sure yet". What Jamvi files itself is filed again; what the
// person chose or unconfirmed is left alone.
describe('a restored draft', () => {
  const lines = [
    line({ index: 0, type: 'airtime_purchase', description: 'Airtime' }),
    line({ index: 1, receipt: 'TESTDRAFT2', type: 'airtime_purchase', description: 'Airtime' }),
    line({ index: 2, receipt: 'TESTDRAFT3', type: 'airtime_purchase', description: 'Airtime' }),
    line({ index: 3, receipt: 'TESTDRAFT4', type: 'other', direction: 'in', description: 'M-Shwari Loan', amount: 1000 }),
  ];
  const old: Record<number, Choice> = {
    0: { include: true, category: NOT_SURE_CATEGORY, auto: true },
    1: { include: true, category: 'Phone', auto: false },
    2: { include: true, category: NOT_SURE_CATEGORY, auto: true, confirmed: false },
    3: { include: true, category: '', auto: false, incomeSourceId: 5, sourceAuto: true },
  };

  it("gets Jamvi's filings on lines nobody touched", () => {
    const next = refreshSuggestions(lines, old, [], ['Airtime']);
    expect(next[0]).toMatchObject({ category: 'Airtime', confirmed: true });
    expect(next[3]).toMatchObject({ incomeSourceId: null, confirmed: true });
  });

  it('and keeps what the person chose or unconfirmed', () => {
    const next = refreshSuggestions(lines, old, [], ['Airtime']);
    expect(next[1]).toMatchObject({ category: 'Phone', auto: false });
    expect(next[1].confirmed).toBeUndefined();
    expect(next[2].confirmed).toBe(false);
  });
});
