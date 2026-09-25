import { describe, expect, it } from 'vitest';
import {
  buildPostings,
  canReport,
  categoryChanges,
  chooseTransfer,
  throughMpesaHints,
  chooseIncomeSource,
  initialChoices,
  isRecordable,
  lineLabel,
  messageFor,
  problemWith,
  recategorisable,
  redactForReport,
  reviewCounts,
  reviewStatus,
  snippetFor,
  splitMessages,
  suggestCategory,
  suggestIncomeSource,
  summarise,
  type PostingContext,
  type PreviewLine,
} from '@/lib/mpesaImport';

const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: 0,
  status: 'ready',
  reason: null,
  receipt: 'TESTSEND1',
  direction: 'out',
  type: 'person_payment',
  amount: 70,
  description: 'Sample Person',
  date: '2026-09-02',
  fee: null,
  mpesaBalance: 0,
  alreadyRecorded: null,
  ...over,
});

const ctx: PostingContext = { accountId: 9, userId: 'u1', isShared: false, today: '2026-09-25', chargeCategory: 'Bank charges' };

describe('suggestCategory', () => {
  const history = [
    { type: 'disbursement', description: 'Kenya Power', expenseCategory: 'Electricity' },
    { type: 'disbursement', description: ' kenya  power ', expenseCategory: 'Electricity' },
    { type: 'disbursement', description: 'Kenya Power', expenseCategory: 'Household' },
    { type: 'deposit', description: 'Kenya Power', expenseCategory: 'Ignored' },
    { type: 'disbursement', description: 'Other', expenseCategory: 'Fun' },
  ];
  it('uses the category that payee was most often filed under, ignoring case and spacing', () => {
    expect(suggestCategory('KENYA POWER', history)).toBe('Electricity');
  });
  it('has no suggestion for a payee it has not seen', () => {
    expect(suggestCategory('New Shop', history)).toBe('');
    expect(suggestCategory('', history)).toBe('');
  });
});

describe('what starts ticked', () => {
  const lines = [
    line({ index: 0 }),
    line({ index: 1, direction: 'in', description: 'Received from Sample Person' }),
    line({ index: 2, status: 'skipped', reason: 'A reversal.', direction: null, amount: null }),
    line({ index: 3, alreadyRecorded: { date: '2026-09-02', description: 'Sample Person' } }),
  ];
  it('ticks what can be recorded, and nothing skipped or already recorded', () => {
    const choices = initialChoices(lines, []);
    expect(lines.map((l) => isRecordable(l))).toEqual([true, true, false, false]);
    expect(Object.values(choices).map((c) => c.include)).toEqual([true, true, false, false]);
  });
  it('pre-fills the category for a payee seen before', () => {
    const choices = initialChoices([line({ description: 'Kenya Power' })], [
      { type: 'disbursement', description: 'Kenya Power', expenseCategory: 'Electricity' },
    ]);
    expect(choices[0].category).toBe('Electricity');
  });
});

describe('problemWith', () => {
  it('asks for a category on money out only, and only while ticked', () => {
    expect(problemWith(line({}), { include: true, category: '' })).toBe('Choose what it was for.');
    expect(problemWith(line({}), { include: true, category: 'Transport' })).toBeNull();
    expect(problemWith(line({}), { include: false, category: '' })).toBeNull();
    expect(problemWith(line({ direction: 'in' }), { include: true, category: '' })).toBeNull();
  });
});

describe('summarise', () => {
  it('adds up what is ticked, with the fees counted apart', () => {
    const lines = [
      line({ index: 0, amount: 3000, fee: 25 }),
      line({ index: 1, direction: 'in', amount: 3500 }),
      line({ index: 2, amount: 800, fee: 29 }),
    ];
    const summary = summarise(lines, {
      0: { include: true, category: 'Rent' },
      1: { include: true, category: '' },
      2: { include: false, category: '' },
    });
    expect(summary).toEqual({ count: 2, moneyIn: 3500, moneyOut: 3000, fees: 25, missingCategory: 0, moves: 0 });
  });
});

describe('buildPostings', () => {
  it('sends money in as a deposit that carries its receipt', () => {
    const built = buildPostings(line({ direction: 'in', amount: 3500, receipt: 'TESTRECEIVE2' }), { include: true, category: '' }, ctx);
    expect(built?.kind).toBe('deposit');
    expect(built?.main).toMatchObject({ amount: 3500, mpesaReceipt: 'TESTRECEIVE2', accountId: 9, madeById: 'u1', date: '2026-09-02' });
    expect(built?.fee).toBeNull();
  });

  it('sends money out as a categorised disbursement with its receipt, and the fee as its own posting', () => {
    const built = buildPostings(line({ amount: 3000, fee: 25, receipt: 'TESTPAYBILL1' }), { include: true, category: 'Rent' }, ctx);
    expect(built?.kind).toBe('disbursement');
    expect(built?.main).toMatchObject({ amount: 3000, expenseCategory: 'Rent', mpesaReceipt: 'TESTPAYBILL1', destinationKind: 'category' });
    expect(built?.fee).toMatchObject({ amount: 25, expenseCategory: 'Bank charges', description: 'Bank charge — Sample Person' });
    // The fee is not a receipt of its own: only the payment can be a repeat.
    expect(built?.fee).not.toHaveProperty('mpesaReceipt');
  });

  it('files spending in a shared group under the group, and in a personal budget under the person', () => {
    const shared = buildPostings(line({}), { include: true, category: 'Fun' }, { ...ctx, isShared: true });
    expect(shared?.main).toMatchObject({ madeById: null });
    expect(buildPostings(line({}), { include: true, category: 'Fun' }, ctx)?.main).toMatchObject({ madeById: 'u1' });
  });

  it('uses today when the message carried no date, and leaves out a fee with nowhere to go', () => {
    const built = buildPostings(line({ date: null, fee: 25 }), { include: true, category: 'Fun' }, { ...ctx, chargeCategory: '' });
    expect(built?.main.date).toBe('2026-09-25');
    expect(built?.fee).toBeNull();
  });

  it('builds nothing for a line with no amount or direction', () => {
    expect(buildPostings(line({ amount: null }), { include: true, category: '' }, ctx)).toBeNull();
    expect(buildPostings(line({ direction: null }), { include: true, category: '' }, ctx)).toBeNull();
  });
});

describe('finding a line in a long list', () => {
  it('labels a line with who, how much and when', () => {
    expect(lineLabel(line({ description: 'M-Pesa payment', amount: 1250, date: '2026-09-23' }))).toBe('M-Pesa payment (KES 1,250, 2026-09-23)');
    expect(lineLabel(line({ description: null, amount: null, date: null }))).toBe('A payment');
  });

  it('shows the start of the message a line came from, from the pasted text', () => {
    const pasted = 'TESTA1 Confirmed. Ksh10.00 sent to X. TESTNONAME1 Confirmed. Ksh50.00 paid on 2/9/26 at 9:50 AM.   New M-PESA balance is Ksh0.00.';
    const snippet = snippetFor(pasted, 'TESTNONAME1');
    expect(snippet?.startsWith('TESTNONAME1 Confirmed. Ksh50.00 paid on 2/9/26')).toBe(true);
    expect(snippet).not.toContain('  ');
    expect(snippet!.length).toBeLessThanOrEqual(90);
  });

  it('shows nothing when the receipt is not in the pasted text', () => {
    expect(snippetFor('nothing here', 'TESTNONAME1')).toBeNull();
    expect(snippetFor('anything', null)).toBeNull();
  });
});

describe('sending a message so its format can be learned', () => {
  it('offers it for what could not be read, an unknown kind, or a message that named nobody', () => {
    expect(canReport(line({ status: 'skipped', type: null, direction: null, amount: null, receipt: null }))).toBe(true);
    expect(canReport(line({ status: 'skipped', type: 'other', direction: null }))).toBe(true);
    expect(canReport(line({ named: false }))).toBe(true);
  });

  it('does not offer it for a kind Jamvi understands, a named message, or a repeat', () => {
    expect(canReport(line({ status: 'skipped', type: 'reversal', direction: null }))).toBe(false);
    expect(canReport(line({ status: 'skipped', type: 'cash_deposit', direction: null }))).toBe(false);
    expect(canReport(line({ named: true }))).toBe(false);
    expect(canReport(line({ named: false, alreadyRecorded: { date: '2026-09-02', description: 'x' } }))).toBe(false);
  });

  it('finds line N in the pasted text, the same way the server counts them', () => {
    const pasted = 'TESTAAA1 Confirmed. Ksh10.00 sent to X on 2/9/26. TESTBBB2 Confirmed. Ksh20.00 paid to Y. on 2/9/26.';
    expect(splitMessages(pasted)).toHaveLength(2);
    expect(messageFor(pasted, 1)?.startsWith('TESTBBB2 Confirmed.')).toBe(true);
    expect(messageFor(pasted, 5)).toBeNull();
  });

  it('hides phone numbers before anybody reviews the text', () => {
    const shown = redactForReport('paid to 0712 345 678 and +254 722 111 222 and 0733-444-555');
    expect(shown).not.toMatch(/0712|722 111|0733/);
    expect(shown.match(/<PHONE>/g)).toHaveLength(3);
  });
});

describe('masked numbers in what is about to be sent', () => {
  it('are hidden too: M-Pesa prints 0722***443, which is still a number', () => {
    const shown = redactForReport('from SAMPLE PERSON 0722***443 and 0733+++555 and +254744***666');
    expect(shown).not.toMatch(/0722|0733|744/);
    expect(shown.match(/<PHONE>/g)).toHaveLength(3);
    expect(shown).toContain('SAMPLE PERSON');
  });
});

describe('where money in came from', () => {
  const history = [
    { type: 'deposit', description: 'Received from Sample Person', incomeSourceId: 4 },
    { type: 'deposit', description: ' received  from sample person ', incomeSourceId: 4 },
    { type: 'deposit', description: 'Received from Sample Person', incomeSourceId: 5 },
    { type: 'disbursement', description: 'Received from Sample Person', incomeSourceId: 6 },
  ];
  const sources = [{ id: 4, userId: 'u2' }, { id: 5, userId: 'u1' }];
  const money = (over: Partial<PreviewLine>) => line({ direction: 'in', description: 'Received from Sample Person', ...over });

  it('suggests the source that sender was most often tagged with', () => {
    expect(suggestIncomeSource('RECEIVED FROM SAMPLE PERSON', history)).toBe(4);
    expect(suggestIncomeSource('Someone New', history)).toBeNull();
    expect(suggestIncomeSource('', history)).toBeNull();
  });

  it('starts money in with the suggestion, marked as automatic', () => {
    const choices = initialChoices([money({ index: 0 })], history);
    expect(choices[0].incomeSourceId).toBe(4);
    expect(choices[0].sourceAuto).toBe(true);
  });

  it('records the source and names the member it belongs to', () => {
    const built = buildPostings(money({}), { include: true, category: '', incomeSourceId: 4 }, { ...ctx, incomeSources: sources });
    expect(built?.main).toMatchObject({ incomeSourceId: 4, madeById: 'u2' });
  });

  it('records no source when none is chosen, and none for a debt', () => {
    const none = buildPostings(money({}), { include: true, category: '' }, { ...ctx, incomeSources: sources });
    expect(none?.main).not.toHaveProperty('incomeSourceId');
    expect((none?.main as { madeById?: string }).madeById).toBe('u1');
    const debt = buildPostings(
      money({}),
      { include: true, category: '', incomeSourceId: 4, debt: { kind: 'repaid', partyId: 3 } },
      { ...ctx, incomeSources: sources },
    );
    expect(debt?.main).not.toHaveProperty('incomeSourceId');
  });

  it('a choice carries to the same sender lines that have none, and never overwrites one', () => {
    const lines = [money({ index: 0 }), money({ index: 1 }), money({ index: 2, description: 'Someone Else' })];
    const start = { 0: { include: true, category: '' }, 1: { include: true, category: '', incomeSourceId: 5 }, 2: { include: true, category: '' } };
    const next = chooseIncomeSource(lines, start, 0, 4);
    expect(next[0].incomeSourceId).toBe(4);
    expect(next[0].sourceAuto).toBeFalsy();
    expect(next[1].incomeSourceId).toBe(5);
    expect(next[2].incomeSourceId ?? null).toBeNull();
  });
});

describe('what the person has looked at', () => {
  const out = line({ index: 0, description: 'Sample Shop' });
  const money = line({ index: 1, direction: 'in', description: 'Received from Sample Person', receipt: 'TESTRECV1' });

  it('says a line still needing a category needs the person', () => {
    expect(reviewStatus(out, { include: true, category: '' })).toBe('needs');
  });

  it('leaves a line as Jamvi suggested until the person touches it', () => {
    expect(reviewStatus(out, { include: true, category: 'Food', auto: true })).toBe('suggested');
    expect(reviewStatus(money, { include: true, category: '' })).toBe('suggested');
  });

  it('says a line the person set, changed, unticked or linked to a debt is theirs', () => {
    expect(reviewStatus(out, { include: true, category: 'Food', auto: false })).toBe('changed');
    expect(reviewStatus(out, { include: false, category: 'Food', auto: true })).toBe('changed');
    expect(reviewStatus(out, { include: true, category: '', debt: { kind: 'lend', partyId: 3 } })).toBe('changed');
    expect(reviewStatus(money, { include: true, category: '', incomeSourceId: 4, sourceAuto: false })).toBe('changed');
    expect(reviewStatus(money, { include: true, category: '', incomeSourceId: 4, sourceAuto: true })).toBe('suggested');
  });

  it('is not part of the review for a line that cannot be recorded', () => {
    expect(reviewStatus(line({ status: 'skipped' }), { include: true, category: '' })).toBeNull();
    expect(reviewStatus(line({ alreadyRecorded: { date: '2026-09-02', description: 'x' } }), { include: true, category: 'Food' })).toBeNull();
  });

  it('counts them for the summary and the filters', () => {
    const counts = reviewCounts([out, money, line({ index: 2, receipt: 'TESTSEND2' })], {
      0: { include: true, category: 'Food', auto: false },
      1: { include: true, category: '' },
      2: { include: true, category: '' },
    });
    expect(counts).toEqual({ all: 3, needs: 1, changed: 1, suggested: 1 });
  });
});

describe('changing the category of what is already recorded', () => {
  const recorded = (over: Partial<PreviewLine>, editable = true, category: string | null = 'Old') =>
    line({ receipt: 'TESTREC001', alreadyRecorded: { date: '2026-09-02', description: 'Sample Shop', category, editable }, ...over });

  it('offers only ordinary spending that is already recorded', () => {
    const lines = [
      recorded({ index: 0 }),
      recorded({ index: 1, receipt: 'TESTREC002' }, false),
      recorded({ index: 2, receipt: 'TESTREC003', direction: 'in' }),
      line({ index: 3, receipt: 'TESTREC004' }),
    ];
    expect(recategorisable(lines).map((l) => l.index)).toEqual([0]);
  });

  it('sends only the entries given a different category', () => {
    const lines = [recorded({ index: 0 }), recorded({ index: 1, receipt: 'TESTREC002' }), recorded({ index: 2, receipt: 'TESTREC003' })];
    expect(categoryChanges(lines, { 0: 'Food', 1: 'Old', 2: '  ' })).toEqual([{ receipt: 'TESTREC001', category: 'Food' }]);
  });
});

describe('money moving between the own accounts of a person', () => {
  const inFromBank = line({ index: 0, direction: 'in', type: 'bank_receipt', amount: 7000, date: '2026-09-01', description: 'Received from Sample Bank', receipt: 'TESTBANK01' });
  const outToBank = line({ index: 1, direction: 'out', type: 'paybill_payment', amount: 7000, date: '2026-09-01', description: 'Other Sample Bank', receipt: 'TESTBANK02', fee: 25 });

  it('records money in from a bank as a transfer into the M-Pesa account, with the receipt on that side', () => {
    const built = buildPostings(inFromBank, { include: true, category: '', transferTo: 4 }, ctx);
    expect(built?.kind).toBe('transfer');
    expect(built?.main).toMatchObject({ sourceAccountId: 4, destinationAccountId: 9, amount: 7000, mpesaReceipt: 'TESTBANK01', mpesaAccountId: 9 });
    expect(built?.fee).toBeNull();
  });

  it('records money out to a bank as a transfer out of the M-Pesa account, and keeps the charge', () => {
    const built = buildPostings(outToBank, { include: true, category: '', transferTo: 4 }, ctx);
    expect(built?.kind).toBe('transfer');
    expect(built?.main).toMatchObject({ sourceAccountId: 9, destinationAccountId: 4, mpesaReceipt: 'TESTBANK02', mpesaAccountId: 9 });
    expect(built?.fee).toMatchObject({ amount: 25, expenseCategory: 'Bank charges' });
  });

  it('needs no category, and counts as neither money in nor money out', () => {
    expect(problemWith(outToBank, { include: true, category: '', transferTo: 4 })).toBeNull();
    const summary = summarise([inFromBank, outToBank], { 0: { include: true, category: '', transferTo: 4 }, 1: { include: true, category: '', transferTo: 4 } });
    expect(summary).toMatchObject({ count: 2, moneyIn: 0, moneyOut: 0, fees: 25, moves: 2, missingCategory: 0 });
  });

  it('counts as something the person set, and clears a debt link or source', () => {
    expect(reviewStatus(outToBank, { include: true, category: '', transferTo: 4 })).toBe('changed');
    const next = chooseTransfer({ 1: { include: true, category: '', debt: { kind: 'lend', partyId: 3 } } }, 1, 4);
    expect(next[1]).toMatchObject({ transferTo: 4, debt: null });
    expect(chooseTransfer(next, 1, null)[1].transferTo).toBeNull();
  });

  it('hints at money passing through M-Pesa: a bank paying in and the same amount going out that day', () => {
    const other = line({ index: 2, direction: 'out', amount: 500, date: '2026-09-01', receipt: 'TESTOTHER1' });
    expect([...throughMpesaHints([inFromBank, outToBank, other])].sort()).toEqual([0, 1]);
    expect(throughMpesaHints([other]).size).toBe(0);
  });
});

describe('hinting at money passing through M-Pesa when only some of it is sent on', () => {
  const fromBank = line({ index: 0, direction: 'in', type: 'bank_receipt', amount: 3000, date: '2026-09-01', description: 'Received from Sample Bank', receipt: 'TESTWIDE01' });
  const smaller = line({ index: 1, direction: 'out', type: 'paybill_payment', amount: 2500, date: '2026-09-01', description: 'Sample Kcb Bank (Acc 1)', receipt: 'TESTWIDE02' });
  const shop = line({ index: 2, direction: 'out', type: 'paybill_payment', amount: 800, date: '2026-09-01', description: 'Sample Electricity Company', receipt: 'TESTWIDE03' });
  const person = line({ index: 3, direction: 'out', type: 'person_payment', amount: 500, date: '2026-09-01', description: 'Sample Person', receipt: 'TESTWIDE04' });
  const otherDay = line({ index: 4, direction: 'out', type: 'paybill_payment', amount: 2500, date: '2026-09-02', description: 'Sample Kcb Bank', receipt: 'TESTWIDE05' });
  const bigger = line({ index: 5, direction: 'out', type: 'paybill_payment', amount: 4000, date: '2026-09-01', description: 'Sample Equity Bank', receipt: 'TESTWIDE06' });

  it('hints at a smaller payment to a bank the same day, the rest having stayed in M-Pesa', () => {
    expect([...throughMpesaHints([fromBank, smaller])].sort()).toEqual([0, 1]);
  });

  it('leaves everyday spending, other days and bigger amounts alone', () => {
    expect([...throughMpesaHints([fromBank, shop, person, otherDay, bigger])]).toEqual([0]);
  });

  it('still hints at an exact match of any kind', () => {
    const exact = line({ index: 6, direction: 'out', type: 'person_payment', amount: 3000, date: '2026-09-01', description: 'Sample Person', receipt: 'TESTWIDE07' });
    expect(throughMpesaHints([fromBank, exact]).has(6)).toBe(true);
  });
});

