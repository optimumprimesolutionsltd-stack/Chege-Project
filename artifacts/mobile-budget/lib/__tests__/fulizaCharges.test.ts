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

// The fees were a separate button to notice and tap; now they are a line in
// the import like any other, ticked, for Fuliza charges.
describe('on the import screen', () => {
  const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
  const lib = readFileSync('lib/mpesaImport.ts', 'utf8');

  it('has no separate button: the fees are a line of the import', () => {
    expect(screen).not.toContain('testID="mpesa-fuliza-record"');
    expect(screen).not.toContain('recordFulizaCharges');
  });

  it('files the Fuliza line under Fuliza charges when the budget has it, as before when not', () => {
    expect(lib).toContain("const builtIn = categoryNames.find((name) => name.trim().toLowerCase() === 'fuliza charges');");
    expect(lib).toContain("(line.type === 'fuliza_fee' ? chargeCategory : '') ||");
  });

  it('files a lone M-Pesa charge under the charges category', () => {
    expect(lib).toContain("if (line.type === 'transaction_charge') return chargeCategory || defaultCategoryFor(line, categoryNames);");
  });

  it('takes what an overlapping statement already recorded off the Fuliza lines, rather than unticking them', () => {
    // Unticking lost the days the earlier statement did not cover; the lines
    // now add only the difference (withoutRecordedFuliza).
    expect(screen).toContain('const reading = withoutRecordedFuliza(');
    expect(screen).toContain('testID="mpesa-fuliza-overlap"');
  });

  it('files M-Pesa charges under the built-in category without asking, when the budget has it', () => {
    expect(screen).toContain("row.name.trim().toLowerCase() === 'm-pesa charges'");
    expect(screen).toContain('if (builtInCharge) setChargeCategory(builtInCharge);');
  });
});

// The account has to start where the statement starts. When nothing is
// recorded in it before the statement, setting it to match is certainly right.
describe('the starting balance', () => {
  const screen = readFileSync('app/mpesa-import.tsx', 'utf8');

  it('offers to set it only when nothing is recorded before the statement', () => {
    expect(screen).toContain('if (rows.some((row) => String(row.date).slice(0, 10) < first)) return null;');
    expect(screen).toContain('testID="mpesa-opening-fix-button"');
  });

  it('sets it to the statement opening, dated the day before', () => {
    expect(screen).toContain('before.setUTCDate(before.getUTCDate() - 1);');
    expect(screen).toContain('openingBalance: openingFix.to, openingBalanceDate: openingFix.date, accountId');
  });

  it('is for those who can manage the budget', () => {
    expect(screen).toContain('{openingFix && canManageBudget ? (');
  });
});
