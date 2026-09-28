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
    expect(screen).toContain("formatKES(Math.abs(data?.total ?? 0))");
    expect(screen).toContain('other?.borrowed');
    expect(screen).toContain('other?.repaidToYou');
    expect(screen).toContain('other?.fromSavings');
  });
});

// A side hustle's income is its profit: sales less what it cost to run, which
// is spending in the categories linked to it on Reports.
describe('each income stream shows what it earned, not what it sold', () => {
  it('takes its cards from the server, which knows each stream\'s costs', () => {
    expect(screen).toContain('(data?.streams ?? []).map((stream) => {');
  });

  it('shows received less costs, and the profit or loss', () => {
    expect(screen).toContain('`Received ${formatKES(group.received)} − costs ${formatKES(group.costs)}`');
    expect(screen).toContain("{group.net < 0 ? 'loss' : 'profit'}");
  });

  it('puts a split deposit under each stream at that stream\'s share only', () => {
    expect(screen).toContain('.filter((portion) => portion.incomeSourceId === stream.incomeSourceId)');
    expect(screen).toContain('renderEntry(entry, index, share)');
  });

  it('explains the headline when costs came off it', () => {
    expect(screen).toContain('testID="income-ledger-net-of-costs"');
  });

  it('keeps the date view at full amounts', () => {
    expect(screen).toContain('day.rows.map((entry, index) => renderEntry(entry, index))');
  });
});
