import { describe, expect, it } from 'vitest';
import { describePattern, patternHint, patternsOf, recentOf, type Paid } from '@/lib/paymentPatterns';
import { bandRule, ruleCategoryFor, ruleLabel, ruleSourceFor, withBandRule, withSourceRule } from '@/lib/payeeLearning';
import { keepAnswer, savedGroups } from '@/lib/teachJamvi';
import type { EntryToSort } from '@/lib/entriesToSort';

// "Jamvi can check out where there has been multiple payments and suggest what to
// do ... the user should recognize that immediately" (10 Oct 2026).
const salary = (month: number, amount = 52000, day = 28): Paid => ({ amount, date: `2026-${String(month).padStart(2, '0')}-${day}` });
const varied: Paid[] = [
  { amount: 3000, date: '2026-10-05' }, { amount: 1500, date: '2026-09-14' }, { amount: 12000, date: '2026-08-02' },
  { amount: 700, date: '2026-07-21' }, { amount: 4500, date: '2026-06-09' },
];

describe('the kinds of payment a payee makes', () => {
  it('pay each month apart from the rest', () => {
    const items = [salary(3, 51000), salary(4), salary(5, 52500, 27), salary(6), salary(7, 53000, 29), ...varied];
    const [pay, rest] = patternsOf(items);
    expect(pay.kind).toBe('monthly');
    expect(pay.positions).toEqual([0, 1, 2, 3, 4].sort((a, b) => items[a].amount - items[b].amount));
    expect(pay.day).toBe(28);
    expect(pay.lo).toBeLessThanOrEqual(51000);
    expect(pay.hi).toBeGreaterThanOrEqual(53000);
    expect(rest.kind).toBe('varied');
    expect(rest.positions).toHaveLength(5);
    expect(describePattern(pay, items)).toBe('5 times, about KES 52,000, around the 28th of each month, Mar – Jul 2026');
    expect(describePattern(rest, items)).toBe('5 times, KES 700 to KES 12,000, Jun – Oct 2026');
    expect(recentOf(rest, items)).toBe('Last: 5 Oct KES 3,000 · 14 Sep KES 1,500 · 2 Aug KES 12,000');
    expect(patternHint(pay, 'in', true)).toContain('looks like pay');
    expect(patternHint(rest, 'in', true)).toContain('your own money');
  });

  it('the same amount, again and again, at any time', () => {
    const items: Paid[] = [{ amount: 1000, date: '2026-10-01' }, { amount: 1000, date: '2026-10-03' }, { amount: 1000, date: '2026-10-09' }, ...varied];
    expect(patternsOf(items).map((one) => one.kind)).toEqual(['same', 'varied']);
  });

  it('nothing in common: one kind, nothing to split', () => {
    expect(patternsOf(varied).map((one) => one.kind)).toEqual(['varied']);
  });

  it('twice a month is not monthly', () => {
    const items = [1, 1, 2, 2, 3, 3].map((month, at) => salary(month, 5000, at % 2 ? 15 : 1));
    expect(patternsOf(items)[0].kind).not.toBe('monthly');
  });
});

describe('answers kept by amount', () => {
  const band = { base: 'src:equity bulk account', lo: 47000, hi: 57000 };
  it('a band wins for the amounts it covers; the payee rule keeps the rest', () => {
    let rules = withSourceRule({}, 'Received from Equity Bulk Account', 9);
    rules = withBandRule(rules, band, '4');
    expect(ruleSourceFor('Received from Equity Bulk Account', 52000, rules)).toBe(4);
    expect(ruleSourceFor('Received from Equity Bulk Account', 3000, rules)).toBe(9);
    expect(bandRule('Received from Equity Bulk Account', 'in', 60000, rules)).toBe('');
    expect(ruleLabel('band:src:equity bulk account:47000-57000')).toBe('equity bulk account, KES 47,000 to 57,000');
  });
  it('an own account in a band is never taken for a category', () => {
    const rules = withBandRule({}, { base: 'naivas', lo: 100, hi: 200 }, 'own:3');
    expect(ruleCategoryFor('Naivas', 150, rules)).toBe('');
  });
});

describe('Teach Jamvi asks about each kind once', () => {
  let id = 0;
  const entry = (paid: Paid): EntryToSort => ({ id: ++id, type: 'deposit', direction: 'in', amount: paid.amount, date: paid.date!, description: 'Received from Equity Bulk Account' });
  const entries = [salary(3), salary(4), salary(5), salary(6), ...varied].map(entry);

  it('splits the payee, pay first, and drops a kind once it is answered', () => {
    const groups = savedGroups(entries);
    expect(groups.map((one) => [one.count, one.pattern?.kind])).toEqual([[4, 'monthly'], [5, 'varied']]);
    expect(groups[0].pattern?.band).not.toBeNull();
    expect(groups[1].pattern?.band).toBeNull();
    expect(groups[0].pattern?.text).toContain('around the 28th of each month');

    // Pay answered: a band rule, so the rest is still asked.
    const rules = keepAnswer({}, groups[0], '4', (kept) => withSourceRule(kept, entries[0].description, 4));
    expect(Object.keys(rules)).toEqual([expect.stringMatching(/^band:src:equity bulk account:\d+-\d+$/)]);
    const left = savedGroups(entries, rules);
    expect(left.map((one) => [one.count, one.pattern?.kind])).toEqual([[5, 'varied']]);
    // The rest answered: the payee's own rule, and nothing is asked again.
    const all = keepAnswer(rules, left[0], '9', (kept) => withSourceRule(kept, entries[0].description, 9));
    expect(savedGroups(entries, all)).toEqual([]);
  });

  it('a payee with one kind is left whole, still saying what it sees', () => {
    const groups = savedGroups(varied.map(entry));
    expect(groups).toHaveLength(1);
    expect(groups[0].key).not.toContain('~');
    expect(groups[0].pattern?.text).toBe('5 times, KES 700 to KES 12,000, Jun – Oct 2026');
  });
});
