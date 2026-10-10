import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clashOf, clashText, keptFromNowOn, type EarlierMoneyIn } from '@/lib/sourceClash';
import { bandFor, ruleSourceFor, withBandRule, withSourceRule } from '@/lib/payeeLearning';

// "If the user says it's for a business specified but during onboarding he had
// specified differently, how do we correct this instantly" (10 Oct 2026).
const SALARY = 4;
const UJENZI = 7;
const payer = 'Received from Equity Bulk Account';
const earlier = (id: number, amount: number, incomeSourceId = SALARY, description = payer): EarlierMoneyIn =>
  ({ id, amount, date: '2026-09-28', description, incomeSourceId });
const names = new Map([[SALARY, 'Salary'], [UJENZI, 'Ujenzi Hardware']]);
const name = (id: number) => names.get(id) ?? '?';
const isBusiness = (id: number) => id === UJENZI;

describe('a choice that goes against what Jamvi had', () => {
  it('a rule that says otherwise, and the earlier payments under it, are offered to change', () => {
    const rules = withSourceRule({}, payer, SALARY);
    const clash = clashOf({ id: 1, description: payer, amount: 52000 }, UJENZI, rules, [earlier(2, 52000), earlier(3, 51000), earlier(4, 9000, UJENZI)]);
    expect(clash?.keptId).toBe(SALARY);
    expect(clash?.others.map((one) => one.id)).toEqual([2, 3]);
    const { title, message } = clashText('Equity Bulk Account', clash!, name, UJENZI, isBusiness);
    expect(title).toBe('Equity Bulk Account: Ujenzi Hardware from now on?');
    expect(message).toContain('Before, Jamvi had Equity Bulk Account as Salary. 2 earlier payments are under Salary.');
    expect(message).toContain("Ujenzi Hardware is a business: its sales are kept apart from your own income.");
    // From now on: the payer's rule changes.
    expect(ruleSourceFor(payer, 52000, keptFromNowOn(rules, payer, clash!, UJENZI))).toBe(UJENZI);
  });

  it('no rule, but earlier payments under something else: still offered', () => {
    const clash = clashOf({ id: 1, description: payer, amount: 3000 }, SALARY, {}, [earlier(2, 2000, UJENZI)]);
    expect(clash?.keptId).toBeNull();
    expect(clash?.earlierId).toBe(UJENZI);
    expect(clashText('Equity Bulk Account', clash!, name, SALARY, isBusiness).message).toContain("Salary is your own income, not Ujenzi Hardware's sales.");
  });

  it('nothing to say when it agrees, or the others are another payer, or the ones just sorted', () => {
    const rules = withSourceRule({}, payer, UJENZI);
    expect(clashOf({ id: 1, description: payer, amount: 100 }, UJENZI, rules, [earlier(2, 100, UJENZI)])).toBeNull();
    expect(clashOf({ id: 1, description: payer, amount: 100 }, UJENZI, {}, [earlier(2, 100, SALARY, 'Received from KCB Bulk')])).toBeNull();
    expect(clashOf({ id: 1, description: payer, amount: 100 }, UJENZI, {}, [earlier(2, 100)], new Set([2]))).toBeNull();
  });

  it('one kind of payment: only its amounts move, and only its band changes', () => {
    const band = { base: 'src:equity bulk account', lo: 47000, hi: 57000 };
    const rules = withBandRule(withSourceRule({}, payer, 9), band, String(SALARY));
    expect(bandFor(payer, 'in', 52000, rules)).toEqual(band);
    const clash = clashOf({ id: 1, description: payer, amount: 52000 }, UJENZI, rules, [earlier(2, 52000), earlier(3, 3000)]);
    expect(clash?.others.map((one) => one.id)).toEqual([2]);
    const next = keptFromNowOn(rules, payer, clash!, UJENZI);
    expect(ruleSourceFor(payer, 52000, next)).toBe(UJENZI);
    expect(ruleSourceFor(payer, 3000, next)).toBe(9);
  });
});

describe('asked where money in is put under a source', () => {
  it('after Sort them out and after an edit on Bank, never over another question about the payer', () => {
    const sort = readFileSync('app/sort-entries.tsx', 'utf8');
    expect(sort).toContain("if ('incomeSourceId' in change && changed.length > 0) void correctSource(changed[0], change.incomeSourceId, changed.map((one) => one.id));");
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain('if (sourceCorrection && !askedAboutPayer) void correctSource(sourceCorrection.entry, sourceCorrection.chosen);');
  });

  it('by who paid and what for, with a business added right there', () => {
    const card = readFileSync('components/TeachJamviCard.tsx', 'utf8');
    expect(card).toContain('return `Who paid you, and what for?`;');
    expect(card).toContain("section('PAID TO YOU'");
    expect(card).toContain("section('A CUSTOMER PAYING YOUR BUSINESS'");
    expect(card).toContain("'Add your business…'");
    for (const screen of ['app/teach-jamvi.tsx', 'app/mpesa-import.tsx']) expect(readFileSync(screen, 'utf8')).toContain('onNewBusiness={async (taught, name) => {');
  });
});
