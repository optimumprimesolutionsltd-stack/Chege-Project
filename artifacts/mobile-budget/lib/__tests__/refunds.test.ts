import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPostings, type PostingContext, type PreviewLine } from '@/lib/mpesaImport';

// "Reversal should take its own course without necessarily tagging a previous
// pay" - "a refund" (9 Oct 2026). api-server lib/refunds.
const ctx: PostingContext = { accountId: 9, userId: 'u1', isShared: false, today: '2026-10-09', chargeCategory: 'Bank charges' };
const reversal: PreviewLine = {
  index: 0, status: 'ready', reason: null, receipt: 'TESTREV01', direction: 'in', type: 'reversal', amount: 2_000,
  description: 'Money back: reversal of ABC123', date: '2026-09-03', fee: null, mpesaBalance: 0, alreadyRecorded: null,
};

describe('money back from M-Pesa is saved as a refund', () => {
  it('a refund payment, not money in - the server picks its category when none is chosen', () => {
    const posting = buildPostings(reversal, { include: true, category: '' }, ctx);
    expect(posting?.kind).toBe('disbursement');
    expect(posting?.main).toMatchObject({ amount: 2_000, isRefund: true, accountId: 9, mpesaReceipt: 'TESTREV01' });
    expect(posting?.main).not.toHaveProperty('expenseCategory');
    expect(posting?.fee).toBeNull();
  });

  it('in the category chosen on the line', () => {
    const posting = buildPostings(reversal, { include: true, category: 'Groceries' }, ctx);
    expect(posting?.main).toMatchObject({ isRefund: true, expenseCategory: 'Groceries' });
  });
});

describe('refunds through the server and on screen', () => {
  const route = readFileSync('../api-server/src/routes/joint-account.ts', 'utf8');
  const index = readFileSync('../api-server/src/index.ts', 'utf8');
  const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
  it('is stored as a negative payment, kept one when edited, and never linked', () => {
    expect(route).toContain('amount: isRefund ? -Math.abs(amount) : amount,');
    expect(route).toContain('amount: staysRefund ? -Math.abs(amount) : Math.abs(amount),');
    expect(route).toContain('const REFUNDS_NOT_LINKS = true;');
  });
  it('money back saved before refunds is converted once, at startup', () => {
    expect(index).toContain('void ensureReversalLinks().then(() => convertMoneyBackToRefunds());');
  });
  it('Bank shows it as money back in, and edits it as a positive amount', () => {
    expect(bank).toContain("const refund = item.type === 'disbursement' && Number(item.amount) < 0;");
    expect(bank).toContain('testID={`bank-refund-${item.id}`}');
    expect(bank).toContain('setAmount(String(Math.abs(Number(tx.amount))));');
  });
});
