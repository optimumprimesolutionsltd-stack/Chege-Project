import { describe, expect, it } from 'vitest';
import { personTagOf, phoneIn, tagOf, withoutPersonTag, withPersonTag } from '@/lib/personNumber';
import { ruleCategory, ruleSource, withRule, withSourceRule, looksLikePerson } from '@/lib/payeeLearning';
import { samePayeeName } from '@/lib/samePayee';
import { suggestCategory, suggestIncomeSource } from '@/lib/mpesaImport';
import { applyNicknames, withNickname } from '@/lib/payeeNicknames';
import { isNamedPayee, namedKeyFor } from '@/lib/namedPayees';

// "A person is remembered by name, not by phone number. Two different people
// with exactly the same name would be treated as one - this is not good" (8 Oct 2026).
describe('a person tagged by their number', () => {
  it('reads every way M-Pesa writes the number as one tag', () => {
    for (const number of ['0722***443', '0722+++443', '0722xxx443', '+254722***443', '2547***443', '0722123443', '254722123443']) {
      expect(personTagOf(number)).toBe('07…443');
    }
    expect(personTagOf('0110***222')).toBe('01…222');
    expect(personTagOf('12345')).toBeNull();
    expect(personTagOf(null)).toBeNull();
  });

  it('finds the number in a statement row and a message', () => {
    expect(phoneIn('Customer Transfer to - 2547***443 JOHN KAMAU')).toBe('2547***443');
    expect(phoneIn('Ksh70.00 sent to JOHN KAMAU 0722***443 on 2/9/26 at 9:50 AM.')).toBe('0722***443');
    expect(phoneIn('Pay Bill to 522522 - KCB Acc. 1234567')).toBeNull();
  });

  it('is written after the name, once', () => {
    const tagged = withPersonTag('John Kamau', '07…443');
    expect(tagged).toBe('John Kamau · 07…443');
    expect(withPersonTag(tagged, '07…443')).toBe(tagged);
    expect(tagOf(tagged)).toBe('07…443');
    expect(withoutPersonTag(tagged)).toBe('John Kamau');
    expect(withPersonTag('John Kamau', null)).toBe('John Kamau');
  });
});

describe('two people with the same name', () => {
  const supplier = 'John Kamau · 07…443';
  const cousin = 'John Kamau · 01…222';

  it('are two payees', () => {
    expect(samePayeeName(supplier)).not.toBe(samePayeeName(cousin));
    expect(samePayeeName(supplier)).toBe(samePayeeName('JOHN  KAMAU · 07…443'));
    expect(looksLikePerson(supplier)).toBe(true);
  });

  it('keep their own categories', () => {
    let rules = withRule({}, supplier, 'Ujenzi - materials');
    rules = withRule(rules, cousin, 'Family support');
    expect(ruleCategory(supplier, rules)).toBe('Ujenzi - materials');
    expect(ruleCategory(cousin, rules)).toBe('Family support');
    expect(ruleCategory('John Kamau · 07…999', rules)).toBe('');
  });

  it('keep their own income source', () => {
    const rules = withSourceRule({}, 'Received from John Kamau · 07…443', 7);
    expect(ruleSource('Received from John Kamau · 07…443', rules)).toBe(7);
    expect(ruleSource('Received from John Kamau · 01…222', rules)).toBeNull();
  });

  it('are filed by their own history', () => {
    const history = [
      { type: 'disbursement', description: supplier, expenseCategory: 'Ujenzi - materials' },
      { type: 'disbursement', description: cousin, expenseCategory: 'Family support' },
      { type: 'deposit', description: 'Received from John Kamau · 07…443', incomeSourceId: 7 },
    ];
    expect(suggestCategory(supplier, history)).toBe('Ujenzi - materials');
    expect(suggestCategory(cousin, history)).toBe('Family support');
    expect(suggestIncomeSource('Received from John Kamau · 01…222', history)).toBeNull();
  });

  it('are two named accounts', () => {
    const key = namedKeyFor(supplier);
    expect(isNamedPayee(supplier, key)).toBe(true);
    expect(isNamedPayee(cousin, key)).toBe(false);
  });

  it('can have their own nicknames, and keep their tag under one', () => {
    const map = withNickname({}, supplier, 'Fundi John');
    const [shown, other] = applyNicknames([{ description: supplier }, { description: cousin }], map);
    expect(shown.description).toBe('Fundi John · 07…443');
    expect(other.description).toBe(cousin);
  });
});

describe('what was kept before numbers were', () => {
  it('a rule kept by name still applies, until that person gets their own', () => {
    let rules = withRule({}, 'John Kamau', 'Ujenzi - materials');
    expect(ruleCategory('John Kamau · 07…443', rules)).toBe('Ujenzi - materials');
    rules = withRule(rules, 'John Kamau · 01…222', 'Family support');
    expect(ruleCategory('John Kamau · 01…222', rules)).toBe('Family support');
    expect(ruleCategory('John Kamau · 07…443', rules)).toBe('Ujenzi - materials');
    expect(ruleSource('Received from John Kamau · 07…443', withSourceRule({}, 'Received from John Kamau', 4))).toBe(4);
  });

  it('entries filed by name still teach', () => {
    const history = [{ type: 'disbursement', description: 'John Kamau', expenseCategory: 'Ujenzi - materials' }];
    expect(suggestCategory('John Kamau · 07…443', history)).toBe('Ujenzi - materials');
  });

  it('a nickname given to the name still shows', () => {
    const [shown] = applyNicknames([{ description: 'John Kamau · 07…443' }], withNickname({}, 'John Kamau', 'Fundi John'));
    expect(shown.description).toBe('Fundi John · 07…443');
  });
});
