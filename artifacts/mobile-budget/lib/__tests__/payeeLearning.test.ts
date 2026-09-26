import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initialChoices, type PreviewLine } from '@/lib/mpesaImport';
import {
  distinctiveWords,
  ruleLabel,
  fuzzyCategory,
  parseStoredRules,
  payeeKey,
  payeeName,
  ruleCategory,
  withRule,
  withoutRule,
  wordCategory,
} from '@/lib/payeeLearning';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const past = (description: string, expenseCategory: string) => ({ type: 'disbursement', description, expenseCategory });
const NAMES = ['Travel', 'Groceries', 'Utilities', 'Eating out'];

describe('what tells one payee from another', () => {
  it('drops account references and filler words', () => {
    expect(payeeName('Sample Utility (42)')).toBe('Sample Utility');
    expect(payeeKey('  Sample   Utility (Acc 42)')).toBe('sample utility');
    expect(distinctiveWords('The Sample Hotel Ltd Nakuru')).toEqual(['sample', 'hotel', 'nakuru']);
  });
});

describe('a payee that shares most of its name with one already filed', () => {
  const history = [past('Sample Hotel Nakuru', 'Travel'), past('Sample Hotel Nakuru', 'Travel'), past('Sample Grocer Westlands', 'Groceries')];
  it('is filed the same way, so another branch of a hotel needs no teaching', () => {
    expect(fuzzyCategory('Sample Hotel Kisumu', history, NAMES)).toBe('Travel');
  });
  it('does not match on one shared word among several, or on filler', () => {
    expect(fuzzyCategory('Kisumu Fuel Stop', history, NAMES)).toBe('');
    expect(fuzzyCategory('Sample Pharmacy Kisumu', history, NAMES)).toBe('');
  });
  it('gives no suggestion when two categories are equally likely, or the category is gone', () => {
    expect(fuzzyCategory('Sample Hotel Kisumu', [past('Sample Hotel Nakuru', 'Travel'), past('Sample Hotel Mombasa', 'Eating out')], NAMES)).toBe('');
    expect(fuzzyCategory('Sample Hotel Kisumu', history, ['Groceries'])).toBe('');
  });
});

describe('a word that has nearly always meant one category in the person\'s own books', () => {
  const history = [past('Alpha Hotel', 'Travel'), past('Beta Hotel', 'Travel'), past('Gamma Hotel', 'Travel'), past('Delta Hotel', 'Eating out')];
  it('files a hotel never paid before like the hotels that were', () => {
    expect(wordCategory('Zeta Hotel', history, NAMES)).toBe('Travel');
  });
  it('needs more than one payee and a clear majority', () => {
    expect(wordCategory('Zeta Hotel', [past('Alpha Hotel', 'Travel')], NAMES)).toBe('');
    expect(wordCategory('Zeta Hotel', [past('Alpha Hotel', 'Travel'), past('Beta Hotel', 'Eating out')], NAMES)).toBe('');
  });
});

describe('rules the person asked to keep', () => {
  it('are found by the payee\'s name, ignoring account references', () => {
    const rules = withRule({}, 'Sample Utility (42)', 'Utilities');
    expect(ruleCategory('SAMPLE UTILITY (99)', rules)).toBe('Utilities');
    expect(ruleCategory('Someone Else', rules)).toBe('');
  });
  it('can be forgotten, and survive a damaged store', () => {
    const rules = withRule({}, 'Sample Utility', 'Utilities');
    expect(withoutRule(rules, 'sample utility')).toEqual({});
    expect(parseStoredRules('not json')).toEqual({});
    expect(parseStoredRules(JSON.stringify({ a: 'Food', b: 3 }))).toEqual({ a: 'Food' });
  });
});

describe('the order they are tried in when a list is read', () => {
  const line = (over: Partial<PreviewLine>): PreviewLine => ({
    index: 0, status: 'ready', reason: null, receipt: 'TESTLEARN1', direction: 'out', type: 'merchant_payment', amount: 100,
    description: 'Sample Hotel Kisumu', named: true, date: '2026-09-01', fee: null, mpesaBalance: 0, alreadyRecorded: null, ...over,
  });
  const history = [past('Sample Hotel Nakuru', 'Travel'), past('Sample Hotel Nakuru', 'Travel')];

  it('suggests from a similar name, and says it is Jamvi\'s suggestion', () => {
    const choices = initialChoices([line({})], history, NAMES, '');
    expect(choices[0]).toMatchObject({ category: 'Travel', auto: true });
  });

  it('a kept rule beats the history', () => {
    const rules = withRule({}, 'Sample Hotel Kisumu', 'Eating out');
    expect(initialChoices([line({})], history, NAMES, '', rules)[0].category).toBe('Eating out');
  });

  it('does not learn from a line that named nobody', () => {
    expect(initialChoices([line({ named: false, description: 'M-Pesa payment' })], [past('M-Pesa payment', 'Misc'), past('M-Pesa payment', 'Misc')], NAMES, '')[0].category).toBe('Misc');
    expect(initialChoices([line({ named: false, description: 'Sample Hotel' })], history, NAMES, '')[0].category).toBe('');
  });
});

describe('both screens', () => {
  it('offer to remember, list what is remembered and let it be forgotten', () => {
    const phone = read('app/mpesa-import.tsx');
    const web = read('../family-budget/src/pages/mpesa-import.tsx');
    for (const screen of [phone, web]) {
      expect(screen).toContain('mpesa-line-remember-${item.index}');
      expect(screen).toContain('mpesa-rules-open');
      expect(screen).toContain('mpesa-rule-forget-${key}');
      expect(screen).toContain('keepRules(withoutRule(rules, key))');
    }
  });
  it('the same learning on the phone and the web', () => {
    const norm = (s: string) => s.replace(/['"]/g, '"');
    expect(norm(read('../family-budget/src/lib/payee-learning.ts'))).toBe(norm(read('lib/payeeLearning.ts')));
  });
});

describe('till and paybill numbers', () => {
  it('a rule kept for a number applies under any spelling of the name', () => {
    const rules = withRule({}, 'Sample Shop', 'Groceries', '123456');
    expect(ruleCategory('Sample Shop Ltd', rules, '123456')).toBe('Groceries');
    expect(ruleCategory('Totally Different Name', rules, '123456')).toBe('Groceries');
    expect(ruleCategory('Sample Shop', rules)).toBe('Groceries');
    expect(ruleCategory('Totally Different Name', rules, '999999')).toBe('');
  });

  it('a number is read in words in the list of what is remembered', () => {
    expect(ruleLabel('#123456')).toBe('Till or paybill 123456');
    expect(ruleLabel('sample shop')).toBe('sample shop');
  });

  it('a line from a statement carries its number into the suggestion', () => {
    const rules = withRule({}, 'Sample Shop', 'Groceries', '123456');
    const line: PreviewLine = {
      index: 0, status: 'ready', reason: null, receipt: 'TESTNUM001', direction: 'out', type: 'merchant_payment', amount: 100,
      description: 'Other Spelling Of Shop', named: true, date: '2026-09-01', fee: null, mpesaBalance: 0, alreadyRecorded: null, payeeNumber: '123456',
    };
    expect(initialChoices([line], [], NAMES.concat('Groceries'), '', rules)[0]).toMatchObject({ category: 'Groceries', auto: true });
  });
});

describe('a member of a shared group', () => {
  const out: PreviewLine = {
    index: 0, status: 'ready', reason: null, receipt: 'TESTMEM001', direction: 'out', type: 'person_payment', amount: 100,
    description: 'Sample Person', named: true, date: '2026-09-01', fee: null, mpesaBalance: 0, alreadyRecorded: null,
  };
  const money: PreviewLine = { ...out, index: 1, receipt: 'TESTMEM002', direction: 'in', type: 'person_receipt' };
  it('starts with payments out unticked, since only an owner or admin can record them, and money in ticked', () => {
    const choices = initialChoices([out, money], [], NAMES, '', {}, false);
    expect(choices[0].include).toBe(false);
    expect(choices[1].include).toBe(true);
    expect(initialChoices([out, money], [], NAMES, '', {}, true)[0].include).toBe(true);
  });
});

describe('both screens tell a member what they cannot do', () => {
  it('warn, and keep the manager-only choices away', () => {
    const phone = read('app/mpesa-import.tsx');
    const web = read('../family-budget/src/pages/mpesa-import.tsx');
    for (const screen of [phone, web]) {
      expect(screen).toContain('mpesa-member-warning');
      expect(screen).toMatch(/const canManageBudget = !isShared \|\| group\?\.role === ["']owner["'] \|\| group\?\.role === ["']admin["']/);
      expect(screen).toContain('canManageBudget && choice?.include && !choice.debt && !choice.contributorId && otherAccounts.length > 0');
      expect(screen).toContain('rules, canManageBudget)');
    }
  });
});

