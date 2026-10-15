import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canSplitCategory, categorySplitOf, NOT_SURE_CATEGORY, type Choice } from '@/lib/mpesaImport';

// "Its 10,000 is not split but the category is the one that is split. Check the log
// expense logic and implement it in the mpesa import" (13 Oct 2026).
const out = { direction: 'out' as const, amount: 10000 };
const rent: Choice = { include: true, category: 'Rent', categoryParts: [{ category: 'School fees', amount: 5000 }] };

describe('one M-Pesa payment, more than one category', () => {
  it('splits money out under a real category, the line keeping the rest', () => {
    expect(categorySplitOf(out, rent)).toEqual([{ category: 'School fees', amount: 5000 }]);
    expect(categorySplitOf(out, { ...rent, categoryParts: [{ category: 'School fees', amount: 3000 }, { category: 'Food', amount: 2000 }] }))
      .toEqual([{ category: 'School fees', amount: 3000 }, { category: 'Food', amount: 2000 }]);
  });

  it('is not split when the parts leave nothing for the line, or say nothing', () => {
    expect(categorySplitOf(out, { ...rent, categoryParts: [{ category: 'School fees', amount: 10000 }] })).toBeNull();
    expect(categorySplitOf(out, { ...rent, categoryParts: [{ category: '', amount: 5000 }, { category: 'Rent', amount: 5000 }] })).toBeNull();
    expect(categorySplitOf(out, { ...rent, categoryParts: [] })).toBeNull();
  });

  it('only money out under a category: not money in, Not sure yet, a debt, a move or a business', () => {
    expect(canSplitCategory(out, rent)).toBe(true);
    expect(canSplitCategory({ direction: 'in', amount: 10000 }, rent)).toBe(false);
    expect(canSplitCategory(out, { ...rent, category: NOT_SURE_CATEGORY })).toBe(false);
    expect(canSplitCategory(out, { ...rent, include: false })).toBe(false);
    expect(canSplitCategory(out, { ...rent, debt: { partyId: 1, kind: 'pay-back' } })).toBe(false);
    expect(canSplitCategory(out, { ...rent, transferTo: 4 })).toBe(false);
    expect(canSplitCategory(out, { ...rent, businessId: 2 })).toBe(false);
  });

  it('is offered on the line and split once the payment is saved, the same way Bank splits one', () => {
    const screen = readFileSync('app/mpesa-import.tsx', 'utf8');
    expect(screen).toContain('testID={`mpesa-line-split-${item.index}`}');
    expect(screen).toContain('const splitParts = categorySplitOf(item, choice);');
    expect(screen).toContain("await customFetch('/api/transaction-splits/split', {");
  });

  it('shows on Bank as one payment with its categories under it', () => {
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain('joinSplitRows(');
    expect(bank).toContain('testID={`bank-split-parts-${item.id}`}');
    expect(bank).toContain('if (tx.splitParts) {');
  });
});
