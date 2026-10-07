import { describe, expect, it } from 'vitest';
import { initialChoices, sourceNotGuessed, type PreviewLine } from '@/lib/mpesaImport';

// "So money received from people and bank should go to not sure" (8 Oct 2026).
const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: 0, status: 'ready', reason: null, receipt: 'TESTIN0001', direction: 'in', type: 'person_receipt', amount: 3000,
  description: 'Paul Mouguo', named: true, date: '2026-08-29', fee: null, mpesaBalance: 0, alreadyRecorded: null, ...over,
});
const history = [
  { type: 'deposit', description: 'Paul Mouguo', incomeSourceId: 7 },
  { type: 'deposit', description: 'National Bank', incomeSourceId: 7 },
  { type: 'deposit', description: 'ACME LTD SALARY', incomeSourceId: 9 },
];

describe('money in that is not given a source from history', () => {
  it('from a person, a bank, or a cash deposit at an agent', () => {
    expect(sourceNotGuessed({ type: 'person_receipt', description: 'Paul Mouguo' })).toBe(true);
    expect(sourceNotGuessed({ type: 'bank_receipt', description: 'National Bank' })).toBe(true);
    expect(sourceNotGuessed({ type: 'cash_deposit', description: 'Deposit of Funds at Agent Till 337638' })).toBe(true);
    expect(sourceNotGuessed({ type: 'other', description: 'Equity Paybill Account' })).toBe(true);
  });

  it('waits with no source, so Sort them out asks', () => {
    expect(initialChoices([line({})], history as never, [], '')[0].incomeSourceId).toBeNull();
    expect(initialChoices([line({ type: 'bank_receipt', description: 'National Bank' })], history as never, [], '')[0].incomeSourceId).toBeNull();
  });

  it('other money in still learns its source', () => {
    expect(sourceNotGuessed({ type: 'other', description: 'ACME LTD SALARY' })).toBe(false);
    expect(initialChoices([line({ type: 'other', description: 'ACME LTD SALARY' })], history as never, [], '')[0].incomeSourceId).toBe(9);
  });
});
