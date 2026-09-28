import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const screen = readFileSync('app/income-ledger.tsx', 'utf8');
const reports = readFileSync('app/(tabs)/reports.tsx', 'utf8');
const layout = readFileSync('app/_layout.tsx', 'utf8');
const resume = readFileSync('lib/resumeAfterUpdate.ts', 'utf8');

// A list of expenses cannot be judged without what came in to pay for them.
describe('all income, beside all expenses', () => {
  it('is reachable from Reports', () => {
    expect(reports).toContain("router.push('/income-ledger')");
    expect(reports).toContain('testID="open-income-ledger"');
    expect(layout).toContain('<Stack.Screen name="income-ledger"');
  });

  it('comes before All expenses on Reports, since expenses are checked against it', () => {
    expect(reports.indexOf('testID="open-income-ledger"')).toBeGreaterThan(-1);
    expect(reports.indexOf('testID="open-income-ledger"')).toBeLessThan(reports.indexOf('testID="open-expense-ledger"'));
  });

  it('is brought back after an update restarts the app', () => {
    expect(resume).toContain("'/income-ledger'");
  });
});

describe('the list', () => {
  it('announces each date once instead of repeating it down the column', () => {
    expect(screen).toContain('if (last && last.date === entry.date) last.rows.push(entry);');
  });

  it('names every stream a split deposit came from', () => {
    expect(screen).toContain("entry.streams.join(' + ')");
  });

  it('puts the span and the search in the cache key', () => {
    expect(screen).toContain('queryKey: getGetDashboardIncomeLedgerQueryKey(query)');
    expect(screen).toContain('[rangeFrom, rangeTo, search]');
  });

  it('reads a backwards range as the span between the dates', () => {
    expect(screen).toContain('orderedRange(from, to)');
  });
});

describe('money that came in without being income', () => {
  // Borrowing, repayments to you and withdrawals from savings are on the
  // statement this gets checked against, so they are shown - but beside the
  // total, never in it.
  it('is shown under the total rather than counted in it', () => {
    expect(screen).toContain('testID="income-ledger-other-money-in"');
    expect(screen).toContain("`KES ${formatKES(data?.total ?? 0)}`");
    expect(screen).toContain('other?.borrowed');
    expect(screen).toContain('other?.repaidToYou');
    expect(screen).toContain('other?.fromSavings');
  });
});
