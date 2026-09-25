import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyNicknames,
  canNickname,
  nicknameKey,
  nicknameStorageKey,
  parseStoredNicknames,
  withNickname,
} from '@/lib/payeeNicknames';
import { initialChoices, refreshSuggestions, type PreviewLine } from '@/lib/mpesaImport';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: 0,
  status: 'ready',
  reason: null,
  receipt: 'TESTX1',
  direction: 'out',
  type: 'paybill_payment',
  amount: 100,
  description: 'Safaricom Postpaid Bundles',
  named: true,
  date: '2026-10-24',
  fee: null,
  mpesaBalance: null,
  alreadyRecorded: null,
  ...over,
});

// "Build payee nicknames next": rename a payee once, and Jamvi uses it every time.
describe('a nickname', () => {
  it('matches the payee however it is spelled or spaced', () => {
    expect(nicknameKey('  SAFARICOM   Postpaid  Bundles ')).toBe('safaricom postpaid bundles');
  });

  it('replaces the description, keeping the name the message gave', () => {
    const map = withNickname({}, 'Safaricom Postpaid Bundles', 'Data bundles');
    const [shown] = applyNicknames([line({})], map);
    expect(shown.description).toBe('Data bundles');
    expect(shown.original).toBe('Safaricom Postpaid Bundles');
  });

  it('applies to every line of that payee, and to no other', () => {
    const map = withNickname({}, 'safaricom postpaid bundles', 'Data bundles');
    const shown = applyNicknames([line({ index: 0 }), line({ index: 1, description: 'SAFARICOM  POSTPAID BUNDLES' }), line({ index: 2, description: 'Other Shop' })], map);
    expect(shown.map((l) => l.description)).toEqual(['Data bundles', 'Data bundles', 'Other Shop']);
  });

  it('can be changed again from the original name, not stacked on the nickname', () => {
    const first = applyNicknames([line({})], withNickname({}, 'Safaricom Postpaid Bundles', 'Data bundles'));
    const again = applyNicknames(first, withNickname({ [nicknameKey('Safaricom Postpaid Bundles')]: 'Data bundles' }, first[0].original!, 'Internet'));
    expect(again[0].description).toBe('Internet');
    expect(again[0].original).toBe('Safaricom Postpaid Bundles');
  });

  it("is removed by an empty name or by going back to the payee's own name", () => {
    const map = withNickname({}, 'Shop A', 'My shop');
    expect(withNickname(map, 'Shop A', '   ')).toEqual({});
    expect(withNickname(map, 'Shop A', 'SHOP  a')).toEqual({});
  });

  it('is never given to a message that named nobody, which stands for many payees', () => {
    const generic = line({ description: 'M-Pesa payment', named: false });
    expect(canNickname(generic)).toBe(false);
    expect(canNickname(line({}))).toBe(true);
    const map = { [nicknameKey('M-Pesa payment')]: 'Something' };
    expect(applyNicknames([generic], map)[0].description).toBe('M-Pesa payment');
  });
});

describe('keeping them', () => {
  it('is per budget', () => {
    expect(nicknameStorageKey(7)).toBe('jamvi:payee-nicknames:7');
    expect(nicknameStorageKey(7)).not.toBe(nicknameStorageKey(8));
    expect(nicknameStorageKey(undefined)).toBe('jamvi:payee-nicknames:none');
  });

  it('reads what was stored, and shrugs off anything damaged', () => {
    expect(parseStoredNicknames('{"a":"A nick"}')).toEqual({ a: 'A nick' });
    expect(parseStoredNicknames(null)).toEqual({});
    expect(parseStoredNicknames('not json')).toEqual({});
    expect(parseStoredNicknames('[1,2]')).toEqual({});
    expect(parseStoredNicknames('{"a":5,"b":"  ","c":"ok"}')).toEqual({ c: 'ok' });
  });
});

describe('suggestions follow the name the person uses', () => {
  const history = [{ type: 'disbursement', description: 'Data bundles', expenseCategory: 'Internet' }];

  it('finds the category earlier entries under the nickname were filed in', () => {
    const shown = applyNicknames([line({})], withNickname({}, 'Safaricom Postpaid Bundles', 'Data bundles'));
    expect(initialChoices(shown, history)[0]).toMatchObject({ category: 'Internet', auto: true });
  });

  it('refreshes after a rename, but never over a category the person chose', () => {
    const before = [line({ index: 0 }), line({ index: 1, description: 'Other Shop' })];
    const choices = initialChoices(before, history);
    choices[1] = { include: true, category: 'Fun', auto: false };
    const renamed = applyNicknames(before, withNickname({}, 'Safaricom Postpaid Bundles', 'Data bundles'));
    const next = refreshSuggestions(renamed, choices, history, []);
    expect(next[0]).toMatchObject({ category: 'Internet', auto: true });
    expect(next[1]).toMatchObject({ category: 'Fun', auto: false });
  });
});

describe('both apps do the same', () => {
  it('share the exact logic', () => {
    expect(read('../family-budget/src/lib/payee-nicknames.ts')).toBe(read('lib/payeeNicknames.ts').replace(/'/g, '"'));
    expect(read('../family-budget/src/lib/mpesa-import.ts')).toBe(read('lib/mpesaImport.ts').replace(/'/g, '"').replace('./mpesaDebts', './mpesa-debts').replace('./payeeLearning', './payee-learning'));
  });

  it.each([
    ['phone', read('app/mpesa-import.tsx')],
    ['web', read('../family-budget/src/pages/mpesa-import.tsx')],
  ])('%s lets a named payee be renamed, applies saved names at paste time, and refreshes suggestions', (_name, source) => {
    expect(source).toContain('applyNicknames(');
    expect(source).toContain('canNickname(item)');
    expect(source).toContain('withNickname(nicknames, naming.original, naming.text)');
    expect(source).toContain('refreshSuggestions(');
    expect(source).toContain('What do you call this?');
    expect(source).toContain('Jamvi read: ');
    expect(source).toContain('Use the name Jamvi read');
  });

  it('keeps them on the device or browser, per budget', () => {
    expect(read('app/mpesa-import.tsx')).toContain('AsyncStorage.setItem(nicknamesKey, JSON.stringify(next))');
    expect(read('../family-budget/src/pages/mpesa-import.tsx')).toContain('window.localStorage.setItem(nicknamesKey, JSON.stringify(next))');
  });
});
