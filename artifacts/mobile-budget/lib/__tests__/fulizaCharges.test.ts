import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fulizaChargeOverlap, fulizaCharges, type StatementReading } from '../statementImport';

const reading = (overrides: Partial<StatementReading> = {}): StatementReading => ({
  lines: [],
  loanDraws: 79,
  loanRepayments: 24,
  loanDrawTotal: 54416.06,
  loanRepaymentTotal: 55104.31,
  leftOutNet: -100,
  opening: 12024.59,
  closing: 3003.92,
  firstDate: '2026-09-01',
  lastDate: '2026-09-28',
  ...overrides,
});

// Fuliza takes a fee on every day a loan is open, inside the repayments. Draws
// and repayments are both left out of the books, correctly, so the fee - what
// was repaid above what was drawn - was recorded nowhere.
describe('what Fuliza cost over a statement', () => {
  it('is what was repaid above what was drawn', () => {
    expect(fulizaCharges(reading())).toEqual({
      amount: 688.25,
      from: '2026-09-01',
      to: '2026-09-28',
      receipt: 'FZ260901260928',
    });
  });

  it('is nothing when no more was repaid than drawn', () => {
    expect(fulizaCharges(reading({ loanRepaymentTotal: 54416.06 }))).toBeNull();
    expect(fulizaCharges(reading({ loanRepaymentTotal: 100, loanDrawTotal: 5000 }))).toBeNull();
    expect(fulizaCharges(reading({ loanDrawTotal: 0, loanRepaymentTotal: 0 }))).toBeNull();
  });

  it('needs the statement to have dates', () => {
    expect(fulizaCharges(reading({ firstDate: null }))).toBeNull();
  });

  it('carries a stand-in receipt that no real M-Pesa code can match', () => {
    // The server takes 8 to 15 capitals and digits; real codes are ten.
    const { receipt } = fulizaCharges(reading())!;
    expect(receipt).toMatch(/^[A-Z0-9]{8,15}$/);
    expect(receipt).toHaveLength(14);
  });
});

describe('not counting the same days twice', () => {
  const charge = fulizaCharges(reading())!;

  it('recognises this statement already recorded', () => {
    expect(fulizaChargeOverlap(charge, ['TIR1ABC2DE', 'FZ260901260928'])).toEqual({
      sameStatement: true, overlapsFrom: null, overlapsTo: null,
    });
  });

  it('catches an earlier statement that shares days with this one', () => {
    expect(fulizaChargeOverlap(charge, ['FZ260815260910'])).toEqual({
      sameStatement: false, overlapsFrom: '2026-08-15', overlapsTo: '2026-09-10',
    });
  });

  it('lets a statement that only touches the next one through', () => {
    expect(fulizaChargeOverlap(charge, ['FZ260801260831', 'FZ260929261028'])).toEqual({
      sameStatement: false, overlapsFrom: null, overlapsTo: null,
    });
  });

  it('ignores ordinary receipts and empty ones', () => {
    expect(fulizaChargeOverlap(charge, ['TIR1ABC2DE', null, undefined, ''])).toEqual({
      sameStatement: false, overlapsFrom: null, overlapsTo: null,
    });
  });
});

describe('on the import screen', () => {
  const screen = readFileSync('app/mpesa-import.tsx', 'utf8');

  it('offers to record them, for those who can record payments', () => {
    expect(screen).toContain('{fuliza && canManageBudget ? (');
    expect(screen).toContain('testID="mpesa-fuliza-record"');
  });

  it('files them under Fuliza charges, dated at the end of the statement, with the receipt', () => {
    expect(screen).toContain('const category = fulizaCategory ?? chargeCategory.trim();');
    expect(screen).toContain('expenseCategory: category,');
    expect(screen).toContain('date: fuliza.to,');
    expect(screen).toContain('mpesaReceipt: fuliza.receipt,');
  });

  it('asks for the charges category first when none is chosen', () => {
    expect(screen).toContain("Alert.alert('Where do charges go?'");
  });

  it('treats a second recording of the same statement as already done', () => {
    expect(screen).toContain('if (status === 409) setFulizaSaved(true);');
  });

  it('warns before counting overlapping days twice', () => {
    expect(screen).toContain('testID="mpesa-fuliza-overlap"');
  });

  it('says when it is only partly fees', () => {
    expect(screen).toContain('It is only all fees if no Fuliza loan was already open when this statement');
  });

  it('files M-Pesa charges under the built-in category without asking, when the budget has it', () => {
    expect(screen).toContain("row.name.trim().toLowerCase() === 'm-pesa charges'");
    expect(screen).toContain('if (builtInCharge) setChargeCategory(builtInCharge);');
    expect(screen).toContain('testID="mpesa-charge-built-in"');
  });

  it('keeps the picker for a budget without the built-in categories yet, so an import never stalls', () => {
    expect(screen).toContain(') : summary && summary.fees > 0 ? (');
  });
});
