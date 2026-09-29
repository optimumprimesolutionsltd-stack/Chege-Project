import { describe, expect, it } from 'vitest';
import { balanceAtEndOf, dayBefore, fulizaOwedBefore, notOnStatement, reconcile, statementLines } from '@/lib/statementImport';
import type { StatementRow } from '@/lib/statementTable';

let n = 0;
const at = (time: string, details: string, over: Partial<StatementRow> = {}): StatementRow => ({
  receipt: `TEST${String((n += 1)).padStart(6, '0')}`,
  time: `2026-09-${time}`,
  details,
  status: 'Completed',
  paidIn: null,
  withdrawn: null,
  balance: 0,
  ...over,
});

describe('statementLines', () => {
  it('reads a payment and folds its charge into the fee', () => {
    const charge = at('02 09:00:00', 'Customer Transfer of Funds Charge', { withdrawn: 7 });
    const payment = { ...at('02 09:00:00', 'Customer Transfer to - 2547***000 SAMPLE PERSON', { withdrawn: 93 }), receipt: charge.receipt };
    const { lines } = statementLines([charge, payment]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      status: 'ready',
      direction: 'out',
      type: 'person_payment',
      amount: 93,
      fee: 7,
      date: '2026-09-02',
      description: 'Sample Person',
      named: true,
    });
  });

  it('puts the oldest first even when the statement lists the newest first', () => {
    const newer = at('03 10:00:00', 'Merchant Payment Online to 123456 - SAMPLE SHOP', { withdrawn: 10 });
    const older = at('01 10:00:00', 'Funds received from - 2547***000 SAMPLE PERSON', { paidIn: 50 });
    const { lines } = statementLines([newer, older]);
    expect(lines.map((line) => line.date)).toEqual(['2026-09-01', '2026-09-03']);
    expect(lines[0]).toMatchObject({ direction: 'in', type: 'person_receipt', description: 'Received from Sample Person' });
  });

  it('records what a Fuliza loan paid for as ordinary spending, and leaves out the loan itself', () => {
    const draw = at('05 12:00:00', 'OverDraft of Credit Party', { paidIn: 200 });
    const payment = { ...at('05 12:00:00', 'Pay Bill Online Fuliza M-Pesa to 123456 - SAMPLE UTILITY Acc. 42', { withdrawn: 200 }), receipt: draw.receipt };
    const repay = at('06 12:00:00', 'OD Loan Repayment to 999999 - M-PESA Overdraw', { withdrawn: 200 });
    const reading = statementLines([repay, payment, draw]);
    expect(reading.loanDraws).toBe(1);
    expect(reading.loanRepayments).toBe(1);
    expect(reading.lines).toHaveLength(1);
    expect(reading.lines[0]).toMatchObject({ type: 'paybill_payment', amount: 200, description: 'Sample Utility (42)' });
  });

  it('reads a payment to a small business (Pochi la Biashara) as a payment to them', () => {
    const { lines } = statementLines([
      at('27 08:00:00', 'Customer Payment to Small Business to - 0743***708 SAMPLE SHOP', { withdrawn: 100 }),
    ]);
    expect(lines[0]).toMatchObject({ direction: 'out', type: 'person_payment', amount: 100, description: 'Sample Shop' });
  });

  it('does not name the person for airtime, and names cash withdrawals', () => {
    const { lines } = statementLines([
      at('01 08:00:00', 'Customer Bundle Purchase to 2547***000 - SAMPLE PERSON by 2547***111', { withdrawn: 20 }),
      at('01 09:00:00', 'Customer Withdrawal at Agent Till to 555 - SAMPLE AGENT', { withdrawn: 300 }),
    ]);
    expect(lines[0]).toMatchObject({ type: 'airtime_purchase', description: 'Airtime', named: false });
    expect(lines[1]).toMatchObject({ type: 'cash_withdrawal', description: 'Cash withdrawal — Sample Agent' });
  });

  // Everything a full statement moved becomes an entry: set aside, it left the
  // account short of the statement with nothing on screen to say why.
  it('lists what it does not recognise, in the words of the statement, for a category to be chosen', () => {
    const { lines } = statementLines([
      at('01 08:00:00', 'Something Never Seen Before', { withdrawn: 5 }),
      at('01 09:00:00', 'Pay Utility Reversal by Lipa na Sample', { withdrawn: 5 }),
    ]);
    expect(lines.map((line) => [line.status, line.type, line.direction, line.description])).toEqual([
      ['ready', 'other', 'out', 'Something Never Seen Before'],
      ['ready', 'other', 'out', 'Pay Utility Reversal by Lipa na Sample'],
    ]);
  });

  it('records a reversal that put money back as money in', () => {
    const { lines } = statementLines([at('01 09:00:00', 'Pay Utility Reversal by Lipa na Sample', { paidIn: 5 })]);
    expect(lines[0]).toMatchObject({ status: 'ready', direction: 'in', type: 'reversal', amount: 5, description: 'Money back: a reversed payment', named: false });
  });

  it('lists a charge with no single payment for it as a charge of its own', () => {
    const row = at('01 08:00:00', 'Pay Bill Charge', { withdrawn: 5 });
    const { lines, leftOutNet } = statementLines([row]);
    expect(lines[0]).toMatchObject({ status: 'ready', type: 'transaction_charge', direction: 'out', amount: 5, description: 'M-Pesa charge' });
    expect(leftOutNet).toBe(0);
  });

  it('gives such a charge its own receipt, so saving the payment beside it cannot hide it', () => {
    const row = at('01 08:00:00', 'Pay Bill Charge', { withdrawn: 5 });
    const { lines } = statementLines([row]);
    expect(lines[0].receipt).toBe(`${row.receipt}C1`);
    expect(lines[0].receipt).toMatch(/^[A-Z0-9]{8,15}$/);
  });

  it('lists what Fuliza cost - repaid above drawn - as one line for the statement', () => {
    const draw = at('01 08:00:00', 'OverDraft of Credit Party', { paidIn: 100 });
    const repay = at('03 08:00:00', 'OD Loan Repayment to 999999 - M-PESA Overdraw', { withdrawn: 104.5 });
    const { lines } = statementLines([repay, draw]);
    const fee = lines.find((line) => line.type === 'fuliza_fee')!;
    expect(fee).toMatchObject({ status: 'ready', direction: 'out', amount: 4.5 });
    expect(fee.receipt).toMatch(/^FZ[0-9]{12}$/);
  });

  it('lists no Fuliza line when no more was repaid than drawn', () => {
    const draw = at('01 08:00:00', 'OverDraft of Credit Party', { paidIn: 100 });
    const repay = at('03 08:00:00', 'OD Loan Repayment to 999999 - M-PESA Overdraw', { withdrawn: 100 });
    expect(statementLines([repay, draw]).lines.some((line) => line.type === 'fuliza_fee')).toBe(false);
  });
});

describe('reconcile', () => {
  // Opening 1,000. +500 received; a Fuliza-funded payment of 300 with a 5 charge and a 100 loan draw;
  // a 100 loan repayment; a 20 reversal. Closing 1,215.
  const statement = () => {
    const received = at('01 08:00:00', 'Funds received from - 2547***000 SAMPLE PERSON', { paidIn: 500, balance: 1500 });
    const draw = at('02 08:00:00', 'OverDraft of Credit Party', { paidIn: 100, balance: 1295 });
    const payment = { ...at('02 08:00:00', 'Pay Bill Online Fuliza M-Pesa to 123456 - SAMPLE UTILITY', { withdrawn: 300, balance: 1200 }), receipt: draw.receipt };
    const charge = { ...at('02 08:00:00', 'Pay Bill Charge', { withdrawn: 5, balance: 1195 }), receipt: draw.receipt };
    const repay = at('03 08:00:00', 'OD Loan Repayment to 999999 - M-PESA Overdraw', { withdrawn: 100, balance: 1195 - 100 + 100 });
    const reversal = at('04 08:00:00', 'Pay Utility Reversal by Lipa na Sample', { paidIn: 20, balance: 1215 });
    return [reversal, repay, charge, payment, draw, received];
  };

  it('finds the opening and closing balance', () => {
    const reading = statementLines(statement());
    expect(reading.opening).toBe(1000);
    expect(reading.closing).toBe(1215);
  });

  it('says what is left out and that the parts add up to the difference', () => {
    const reading = statementLines(statement());
    const result = reconcile(reading, () => true)!;
    expect(result.statementChange).toBe(215);
    // The reversal is recorded as money back in, so only the Fuliza loans and repayments differ, and they cancel here.
    expect(result.savedChange).toBe(215);
    expect(result.gap).toBe(0);
    // Drawn and repaid cancel here, so there is nothing left to explain.
    expect(result.parts).toEqual([]);
  });

  it('counts what is not ticked as part of the difference', () => {
    const reading = statementLines(statement());
    const result = reconcile(reading, (line) => line.direction === 'in')!;
    const unticked = result.parts.find((part) => part.label.includes('not ticked'));
    expect(unticked?.amount).toBe(-305);
    expect(result.parts.reduce((sum, part) => sum + part.amount, 0)).toBe(result.gap);
  });

  it('counts what the account already has as matched, not as a difference', () => {
    const reading = statementLines(statement());
    const earlier = reading.lines.map((line) => (line.direction === 'in' && line.amount === 500 ? { ...line, alreadyRecorded: { date: '2026-09-01', description: 'Saved' } } : line));
    const result = reconcile({ ...reading, lines: earlier }, (line) => !line.alreadyRecorded)!;
    expect(result.alreadyRecordedChange).toBe(500);
    expect(result.savedChange).toBe(-285);
    expect(result.gap).toBe(0);
    expect(result.parts.find((part) => part.label.includes('not ticked'))).toBeUndefined();
  });

  it('explains a Fuliza loan still open at the end as borrowed, not as fees', () => {
    const received = at('01 08:00:00', 'Funds received from - 2547***000 SAMPLE PERSON', { paidIn: 500, balance: 1500 });
    const draw = at('02 08:00:00', 'OverDraft of Credit Party', { paidIn: 80, balance: 1580 });
    const reading = statementLines([draw, received]);
    const result = reconcile(reading, () => true)!;
    expect(reading.lines.some((line) => line.type === 'fuliza_fee')).toBe(false);
    // Listed as borrowed, so saving it leaves the account where M-Pesa's balance is.
    expect(reading.lines.find((line) => line.type === 'fuliza_borrowed')).toMatchObject({ direction: 'in', amount: 80 });
    expect(result.parts).toEqual([]);
    expect(result.gap).toBe(0);
  });

  // September's statement: loans repaid with their fees until the 26th, then more
  // drawn and still owed. Counting that last loan hid the fees, and the balance was off by both.
  it('splits Fuliza into the fees on repaid loans and what is still owed', () => {
    const received = at('01 08:00:00', 'Funds received from - 2547***000 SAMPLE PERSON', { paidIn: 1000, balance: 1000 });
    const draw = at('02 08:00:00', 'OverDraft of Credit Party', { paidIn: 500, balance: 1500 });
    const repay = at('10 08:00:00', 'OD Loan Repayment to 999999 - M-PESA Overdraw', { withdrawn: 506, balance: 994 });
    const later = at('27 08:00:00', 'OverDraft of Credit Party', { paidIn: 800, balance: 1794 });
    const reading = statementLines([later, repay, draw, received]);
    expect(reading.lines.find((line) => line.type === 'fuliza_fee')).toMatchObject({ direction: 'out', amount: 6 });
    const owed = reading.lines.find((line) => line.type === 'fuliza_borrowed')!;
    expect(owed).toMatchObject({ direction: 'in', amount: 800, date: '2026-09-27' });
    expect(owed.receipt).toMatch(/^FB[0-9]{12}$/);
    expect(reading.loanLeftOut).toBe(0);
  });

  it('counts a balance an earlier statement left owed as repaid, not as fees', () => {
    const received = at('01 08:00:00', 'Funds received from - 2547***000 SAMPLE PERSON', { paidIn: 1000, balance: 1000 });
    const repay = at('01 08:00:01', 'OD Loan Repayment to 999999 - M-PESA Overdraw', { withdrawn: 300, balance: 700 });
    const reading = statementLines([repay, received], { amount: 300, receipt: 'FB260801260831' });
    expect(reading.lines.some((line) => line.type === 'fuliza_fee')).toBe(false);
    expect(reading.lines.find((line) => line.type === 'fuliza_repaid')).toMatchObject({ direction: 'out', amount: 300, receipt: 'FR260801260831' });
    expect(reconcile(reading, () => true)!.gap).toBe(0);
  });

  it('has nothing to say when the balances cannot be worked out', () => {
    expect(reconcile({ ...statementLines([]), opening: null }, () => true)).toBeNull();
  });
});

describe('Fuliza owed from an earlier statement', () => {
  const recorded = [
    { mpesaReceipt: 'FB260701260731', amount: 200 },
    { mpesaReceipt: 'FB260801260831', amount: '3178.08' },
    { mpesaReceipt: 'UIRF981AVM', amount: 100 },
  ];
  it('is the latest borrowed line that ended before this statement', () => {
    expect(fulizaOwedBefore('2026-09-01', recorded)).toEqual({ amount: 3178.08, receipt: 'FB260801260831' });
  });
  it('is nothing once its repayment is recorded, or for the same statement read again', () => {
    expect(fulizaOwedBefore('2026-09-01', [...recorded, { mpesaReceipt: 'FR260801260831', amount: 3178.08 }])).toEqual({ amount: 200, receipt: 'FB260701260731' });
    expect(fulizaOwedBefore('2026-08-01', recorded.slice(1))).toBeNull();
  });
});

describe('till and paybill numbers', () => {
  it('are read from a statement row, and only for shops and bills, never a person or airtime', () => {
    const { lines } = statementLines([
      at('01 08:00:00', 'Merchant Payment Online to 123456 - SAMPLE SHOP', { withdrawn: 100 }),
      at('01 09:00:00', 'Pay Bill Online to 654321 - SAMPLE UTILITY Acc. 42', { withdrawn: 50 }),
      at('01 10:00:00', 'Customer Transfer to - 2547***000 SAMPLE PERSON', { withdrawn: 30 }),
      at('01 11:00:00', 'Customer Bundle Purchase to 2547***000 - SAMPLE PERSON by 2547***111', { withdrawn: 20 }),
    ]);
    expect(lines.map((line) => line.payeeNumber)).toEqual(['123456', '654321', null, null]);
  });
});


// "Why is the M-Pesa statement not aligning?" - Jamvi's balance the day
// before the statement, beside M-Pesa's opening, says whether the difference
// is from before it.
describe("Jamvi's balance on a day", () => {
  const rows = [
    { date: '2026-08-30', type: 'deposit', amount: 1000 },
    { date: '2026-08-31T00:00:00.000Z', type: 'disbursement', amount: '336.75' },
    { date: '2026-09-02', type: 'disbursement', amount: 500 },
  ];
  it('is the starting balance plus everything up to the end of that day', () => {
    expect(balanceAtEndOf('2026-08-31', 11000, rows)).toBe(11663.25);
    expect(balanceAtEndOf('2026-09-29', 11000, rows)).toBe(11163.25);
    expect(balanceAtEndOf('2026-08-01', 11000, rows)).toBe(11000);
  });
  it('is asked for the day before the statement starts', () => {
    expect(dayBefore('2026-09-01')).toBe('2026-08-31');
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
  });
});

// "I still can't match the closing balance": what the account has that the
// statement does not is what leaves it off.
describe('entries in Jamvi but not on the statement', () => {
  const reading = { ...statementLines([at('02 08:00:00', 'Pay Bill Online to 123456 - SAMPLE UTILITY', { withdrawn: 300, receipt: 'ABC1234567' })]), firstDate: '2026-09-01', lastDate: '2026-09-29' };
  const rows = [
    { id: 1, date: '2026-09-02', type: 'disbursement', amount: 300, description: 'Sample Utility', mpesaReceipt: 'ABC1234567' },
    { id: 2, date: '2026-09-05', type: 'disbursement', amount: 500, description: 'Typed in', mpesaReceipt: null },
    { id: 3, date: '2026-09-02', type: 'disbursement', amount: 7, description: 'Bank charge', chargeForTransactionId: 1 },
    { id: 4, date: '2026-09-02', type: 'disbursement', amount: 7, description: 'M-Pesa charge', mpesaReceipt: 'ABC1234567C1' },
    { id: 5, date: '2026-08-31', type: 'disbursement', amount: 900, description: 'Before the statement' },
    { id: 6, date: '2026-09-10', type: 'deposit', amount: 200, description: 'Pasted', mpesaReceipt: 'ZZZ9999999' },
  ];
  it('lists them with why, and adds up what they do to the balance', () => {
    const { rows: found, net } = notOnStatement(reading, rows);
    expect(found.map((row) => row.id)).toEqual([2, 4, 6]);
    expect(net).toBe(-500 - 7 + 200);
  });

  it('names the kept-with-payment charge as the twice-counted one when the statement lists the charge on its own', () => {
    const lone = { ...reading, lines: [...reading.lines, { ...reading.lines[0], index: 9, receipt: 'ABC1234567C1', type: 'transaction_charge', amount: 7 }] };
    const { rows: found } = notOnStatement(lone, rows);
    expect(found.map((row) => row.id)).toEqual([2, 3, 6]);
    expect(found.find((row) => row.id === 3)?.why).toMatch(/twice/);
  });
});
