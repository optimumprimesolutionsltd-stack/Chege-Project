import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
const route = readFileSync('../api-server/src/routes/joint-account.ts', 'utf8');
const fix = readFileSync('../api-server/src/lib/borrowed-not-income.ts', 'utf8');

// "If the money is borrowed, income source shouldnt be there" (8 Oct 2026).
describe('borrowed money and repayments have no income source', () => {
  it('the form does not offer income streams for them, and saves none', () => {
    expect(bank).toContain('const notIncome = isBorrowing || repayingParty !== null;');
    expect(bank).toContain('{isDeposit && !notIncome && (singleDepositorId || depositorIds.length === 0) && (');
    expect(bank).toContain('{ incomeSourceId: notIncome ? null : incomeSourceId }');
    expect(bank.match(/\.\.\.\(incomeSourceId && !notIncome \? \{ incomeSourceId \} : \{\}\),/g)).toHaveLength(2);
  });

  it('an edit to Borrowed or repaying you is saved on the entry itself', () => {
    expect(bank).toContain("...(txType === 'deposit' ? { isBorrowing, settlesContributorId:");
    expect(route).toContain('isBorrowing: z.boolean().optional(),');
    expect(route).toContain('const incomeSourceId = hasSplits || notIncome');
  });

  it('entries left wrong are put right at start', () => {
    expect(fix).toContain(`AND l."kind" = 'borrowed'`);
    expect(fix).toContain(`AND ("is_borrowing" = true OR "settles_contributor_id" IS NOT NULL)`);
    expect(readFileSync('../api-server/src/index.ts', 'utf8')).toContain('void fixBorrowedNotIncome();');
  });
});
