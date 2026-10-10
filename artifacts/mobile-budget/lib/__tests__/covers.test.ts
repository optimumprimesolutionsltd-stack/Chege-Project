import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { coversFor, coversKey, coversRules, coversText, formatCovers, parseCovers, sweepSince } from '@/lib/covers';
import { ruleLabel } from '@/lib/payeeLearning';

// "My wife appears under family support - but money sent to her should be to cover
// rent or school fees etc." (10 Oct 2026).
const jane = { plan: [{ category: 'Rent', monthly: 15000 }, { category: 'School fees', monthly: 5000 }], rest: 'Family support' };

describe("what a person's money covers", () => {
  it('kept as a short payee rule, read back the same', () => {
    const key = coversKey('JANE WANJIRU');
    expect(key).toBe('covers:jane wanjiru');
    const value = formatCovers(jane);
    expect(value.length).toBeLessThanOrEqual(200);
    expect(parseCovers(value)).toEqual(jane);
    const rules = { [key]: value, 'jane wanjiru': 'Family support' };
    expect(coversFor('JANE WANJIRU', rules)).toEqual(jane);
    expect(coversRules(rules)).toEqual([{ payeeKey: 'jane wanjiru', ...jane }]);
    expect(ruleLabel(key)).toBe("What jane wanjiru's money covers");
  });

  it('nothing from a broken value', () => {
    expect(parseCovers('not json')).toBeNull();
    expect(parseCovers(JSON.stringify({ p: [], r: 'Family support' }))).toBeNull();
    expect(parseCovers(JSON.stringify({ p: [['Rent', 1000]] }))).toBeNull();
  });

  it('in words, and swept from the first of last month', () => {
    expect(coversText(jane)).toBe('Rent KES 15,000 and School fees KES 5,000 a month, then Family support');
    expect(sweepSince(new Date(2026, 9, 10))).toBe('2026-09-01');
    expect(sweepSince(new Date(2026, 0, 3))).toBe('2025-12-01');
  });
});

describe('where it is offered', () => {
  it('Split this payment on a saved payment, the sweep on Home, Move on a category', () => {
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain('testID="bank-split-payment"');
    expect(bank).toContain('<SplitSheet entry={splitting} onClose={() => setSplitting(null)} />');
    expect(readFileSync('app/(tabs)/index.tsx', 'utf8')).toContain('useApplyCovers(group?.id, canManageBudget, onScreen);');
    const budget = readFileSync('app/(tabs)/budget.tsx', 'utf8');
    expect(budget).toContain('testID="budget-move-money"');
    expect(budget).toContain('<MoveMoneySheet from={movingFrom} month={month} year={year} onClose={() => setMovingFrom(null)} />');
  });

  it('the sweep keeps to the person, found by name on the server', () => {
    const hook = readFileSync('hooks/useApplyCovers.ts', 'utf8');
    expect(hook).toContain('const theirs = entries.filter((entry) => payeeKey(entry.description) === key).map((entry) => entry.id);');
    expect(hook).toContain("body: JSON.stringify({ names: [key], since }),");
  });
});
