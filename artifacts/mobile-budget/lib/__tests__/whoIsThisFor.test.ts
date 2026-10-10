import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { payeeKey, ruleSource, sourceRuleKey, withSourceRule } from '@/lib/payeeLearning';
import { initialChoices, type PreviewLine } from '@/lib/mpesaImport';

// "Since the app already recognizes a bank account, it can ask: is it paying for
// a business (and which one) or just a personal category - then it does the
// rest", for money received too, and for personal M-Pesa numbers (8 Oct 2026).
describe('money in remembered for a business', () => {
  it('by the account in brackets, or by the payer\'s name', () => {
    expect(sourceRuleKey('Kenya Commercial Bank (1234567)')).toBe('src:#ref:1234567');
    expect(sourceRuleKey('Received from Mary Wanjiku')).toBe('src:mary wanjiku');
    const rules = withSourceRule({}, 'Received from Mary Wanjiku', 7);
    expect(ruleSource('Mary Wanjiku', rules)).toBe(7);
    expect(ruleSource('Received from Mary Wanjiku', rules)).toBe(7);
    expect(ruleSource('John Kamau', rules)).toBeNull();
  });

  it('the next import files it there - even money from a person, which is otherwise Not sure', () => {
    const line = { index: 0, status: 'ready', direction: 'in', type: 'person_receipt', amount: 2000, description: 'Received from Mary Wanjiku', date: '2026-10-08', receipt: 'ABC', fee: null, mpesaBalance: null, alreadyRecorded: null } as unknown as PreviewLine;
    const choices = initialChoices([line], [], [], '', withSourceRule({}, 'Mary Wanjiku', 7));
    expect(choices[0].incomeSourceId).toBe(7);
  });
});

describe('money out to a personal number remembered for a business', () => {
  it('the next import files a payment to that person under the business cost - by their name, as kept', () => {
    const line = { index: 0, status: 'ready', direction: 'out', type: 'person_payment', amount: 3000, description: 'John Kamau', payeeNumber: '0712345678', date: '2026-10-08', receipt: 'DEF', fee: null, mpesaBalance: null, alreadyRecorded: null } as unknown as PreviewLine;
    const rules = { [payeeKey('John Kamau')]: 'Ujenzi - materials' };
    const choices = initialChoices([line], [], ['Ujenzi - materials'], '', rules);
    expect(choices[0].category).toBe('Ujenzi - materials');
  });
});

describe('the question on an entry', () => {
  const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
  const card = readFileSync('components/WhoIsThisFor.tsx', 'utf8');

  it('is asked on money out and money in: Personal, or a business', () => {
    expect((bank.match(/<WhoIsThisFor/g) ?? []).length).toBe(2);
    expect(card).toContain("testID={id('who-for-personal')}");
    expect(card).toContain('testID={id(`who-for-business-${one.id}`)}');
  });

  it('money out for a business picks or adds one of its costs', () => {
    expect(card).toContain("testID={id('who-for-new-cost')}");
    expect(bank).toContain("reducesIncomeSourceId: forBusinessId, costKind: 'cogs'");
  });

  it('after Save it does the rest: the payee remembered for the business, and its other entries offered', () => {
    expect(bank).toContain('const askedAboutPayer = whoFor ? await rememberWhoFor(whoFor).catch(() => false) : false;');
    expect(bank).toContain('await namedPayees.add({ key: namedKeyFor(referenceOf(entry.description) || label)');
    expect(bank).toContain('withSourceRule(rules, entry.description, entry.business)');
  });
});
