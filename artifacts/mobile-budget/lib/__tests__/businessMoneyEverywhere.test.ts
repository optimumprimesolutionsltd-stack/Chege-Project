import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPostings, destinationOf, isMove, ownerBusinessOf, problemWith, reviewStatus, type Choice, type PreviewLine } from '@/lib/mpesaImport';

// After money out on Bank (#757): money in from a business on Bank ("yes"), the same one
// tap on the M-Pesa import ("change too"), and a business lived on shown as income on the
// Budget tab ("the income from the business should be shown as income stream. that is after
// expenses reduction", 12 Oct 2026).
const read = (...parts: string[]) => readFileSync(join(__dirname, '..', '..', ...parts), 'utf8');

const line = (over: Partial<PreviewLine> = {}): PreviewLine => ({
  index: 0, status: 'ready', reason: null, receipt: 'TEST000001', direction: 'out', type: 'paybill_payment',
  amount: 5000, description: 'Ujenzi Distributors (42)', date: '2026-10-12', fee: 23, mpesaBalance: null, alreadyRecorded: null,
  ...over,
} as PreviewLine);
const choice: Choice = { include: true, category: '', ownerBusinessId: 7, confirmed: true };
const ctx = { accountId: 1, userId: 'u1', isShared: false, today: '2026-10-12', chargeCategory: 'Bank charges' };

describe('an import line with one of my businesses', () => {
  it('needs no category, and is not spending', () => {
    expect(destinationOf(choice)).toBe('owner-business');
    expect(isMove(choice)).toBe(true);
    expect(problemWith(line(), choice)).toBeNull();
  });

  it('is saved plain - no category, no source - and marked once saved', () => {
    const out = buildPostings(line(), choice, ctx);
    expect(out?.kind).toBe('disbursement');
    expect(out?.main).not.toHaveProperty('expenseCategory');
    const into = buildPostings(line({ direction: 'in', type: 'person_receipt' }), choice, ctx);
    expect(into?.kind).toBe('deposit');
    expect(into?.main).not.toHaveProperty('incomeSourceId');
    const screen = read('app', 'mpesa-import.tsx');
    expect(screen).toContain('await ownerBusiness.mark(ids, businessId);');
    expect(screen).toContain('testID={`mpesa-line-owner-business-${item.index}-${business.id}`}');
  });
});

describe('money in from one of my businesses on Bank', () => {
  it('is a choice under What kind of money is this?, and saves the same way as money out', () => {
    const bank = read('app', '(tabs)', 'bank.tsx');
    // One row of business chips since "there is repetition here" (16 Oct 2026).
    expect(bank).toContain("DIRECTOR'S MONEY FROM");
    expect(bank).toContain('testID="bank-deposit-director-row"');
    expect(bank).toContain("const toBusiness = (txType === 'disbursement' || txType === 'deposit') && pickedBusinessId !== null;");
    expect(bank).toContain(") : txType === 'disbursement' || txType === 'deposit' ? null : (");
  });
});

describe('a business lived on is income on the Budget tab', () => {
  it('asks for income with those businesses, marks them PROFIT, and never removes one there', () => {
    const budget = read('app', '(tabs)', 'budget.tsx');
    expect(budget).toContain('&streams=income`');
    expect(budget).toContain('PROFIT</Text>');
    expect(budget).toContain('editingIncome && !businesses.ids.has(source.id) &&');
    const route = readFileSync(join(__dirname, '..', '..', '..', 'api-server', 'src', 'routes', 'income-sources.ts'), 'utf8');
    expect(route).toContain('req.query.streams === "income" ? new Set(await ownerIncomeBusinessIds(groupId))');
  });
});

// "when i choose who is this for? its still asking for a category" (12 Oct 2026).
describe('Who is this for? naming a business, with none of its costs', () => {
  it("is the director's money to it - nothing more to choose - on the import", () => {
    const picked: Choice = { include: true, category: '', businessId: 7 };
    expect(ownerBusinessOf(line(), picked)).toBe(7);
    expect(problemWith(line(), picked)).toBeNull();
    expect(reviewStatus(line(), picked)).toBe('changed');
    expect(buildPostings(line(), picked, ctx)?.main).not.toHaveProperty('expenseCategory');
    // One of its costs chosen: a cost of the business, as before.
    expect(ownerBusinessOf(line(), { ...picked, category: 'Ujenzi - materials' })).toBeNull();
  });

  it('and on Bank, where the category field gives way to its costs', () => {
    const bank = read('app', '(tabs)', 'bank.tsx');
    expect(bank).toContain("const pickedBusinessId = toBusinessId ?? (txType === 'disbursement' && forBusinessId !== null && !expenseCategory.trim() &&");
    expect(bank).toContain("toBusinessId === null && forBusinessId === null && (");
  });
});
