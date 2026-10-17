import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { joinSplitRows, type SplitPart } from '@/lib/splitRows';

type Row = { id: number; amount: number; expenseCategory: string | null; runningBalance: number; splitOf?: number; splitParts?: SplitPart[] };

// "Its 10,000 is not split but the category is the one that is split" (13 Oct 2026),
// joined on the phone so Bank reads the list every screen shares ("amount is not
// reflecting quickly in banking tab", 15 Oct 2026).
const row = (id: number, amount: number, expenseCategory: string | null, runningBalance: number, splitOf?: number): Row =>
  ({ id, amount, expenseCategory, runningBalance, ...(splitOf ? { splitOf } : {}) });

describe('a split payment on Bank', () => {
  // Newest first: 9857 is a part of 9854.
  const rows = [row(9858, 200, 'Food', 2152), row(9857, 5000, 'School fees', 2352, 9854), row(9856, 90, 'Bank charges', 7352), row(9854, 5000, 'Rent', 7442), row(9850, 10000, null, 12442)];

  it('is one entry at its whole amount, where its newest part was, with each share', () => {
    const joined = joinSplitRows(rows);
    expect(joined.map((one) => one.id)).toEqual([9858, 9854, 9856, 9850]);
    expect(joined[1].amount).toBe(10000);
    expect(joined[1].runningBalance).toBe(2352);
    expect(joined[1].splitParts).toEqual([{ id: 9854, category: 'Rent', amount: 5000 }, { id: 9857, category: 'School fees', amount: 5000 }]);
  });

  it('leaves the list as it is with no split, or when the payment is not in it', () => {
    const plain = rows.map(({ splitOf: _drop, ...rest }) => rest);
    expect(joinSplitRows(plain)).toBe(plain);
    const orphan = [row(9857, 5000, 'School fees', 2352, 1), row(9850, 10000, null, 7352)];
    expect(joinSplitRows(orphan)).toEqual(orphan);
  });

  it('Bank reads the shared list and joins it itself', () => {
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain('const jointAccountParams = selectedAccountId ? { accountId: selectedAccountId } : undefined;');
    expect(bank).not.toContain("splits: 'together'");
    expect(bank).toContain('joinSplitRows((data?.transactions ?? []) as Tx[])');
  });
});
