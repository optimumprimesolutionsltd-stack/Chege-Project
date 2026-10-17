import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { breakdownGap, type PartyBreakdown } from '../partyBreakdown';

const root = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
const bank = read('app/(tabs)/bank.tsx');

const judy = (now: number, fromEntries: number): PartyBreakdown => ({
  id: 7,
  name: 'Judy',
  now: { owedToUs: 0, owedByUs: now },
  fromEntries: { owedToUs: 0, owedByUs: fromEntries },
  notFromEntries: { owedToUs: 0, owedByUs: now - fromEntries },
  entries: [],
});

// "check on who owes who why judys money is 680,100- where isit coming from" (17 Oct 2026).
describe('where a balance comes from', () => {
  it('says how much no entry explains', () => {
    expect(breakdownGap(judy(680100, 600000))).toContain('80,100 of what you owe Judy is not from any entry');
    expect(breakdownGap(judy(500000, 600000))).toContain('100,000 less than the entries add up to');
    expect(breakdownGap(judy(600000, 600000))).toBeNull();
  });

  it('is opened from each balance on Who owes who, and its entries open to edit', () => {
    expect(read('app/parties.tsx')).toContain("router.push(`/party-breakdown?id=${party.id}` as never)");
    const screen = read('app/party-breakdown.tsx');
    expect(screen).toContain('customFetch<PartyBreakdown>(`/api/contributors/${Number(id)}/breakdown`)');
    expect(screen).toContain('router.push(`/(tabs)/bank?editTx=${entry.id}');
    expect(screen).toContain("body: JSON.stringify({ owedByUs: data.fromEntries.owedByUs, owedToUs: data.fromEntries.owedToUs }),");
  });
});

// "on the search button in banking can i have option of seing money in only etc" (17 Oct 2026).
describe('Money in or money out only on Money', () => {
  it('narrows the list with the search, and totals what is shown', () => {
    expect(bank).toContain("(showDirection === 'all' || (showDirection === 'in' ? tx.type === 'deposit' : tx.type === 'disbursement'))");
    expect(bank).toContain("([['all', 'All'], ['in', 'Money in'], ['out', 'Money out']] as const)");
    expect(bank).toContain('KES ${formatKES(listedTotal)}');
  });
});

// "the money back for a category can easily be skipped as its not very clear like the others" (17 Oct 2026).
describe('Money back is a row like the others', () => {
  it('offers the categories most paid from first, in one tap', () => {
    expect(bank).toContain('testID="bank-deposit-money-back-row"');
    expect(bank).toContain('>MONEY BACK FOR</Text>');
    expect(bank).toContain('setMoneyBackFor(name); setCategorySearch(');
    expect(bank).toContain("'Another category…'");
  });
});
