import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EntryToSort } from '../entriesToSort';
import { initialChoices, NOT_SURE_CATEGORY, type PreviewLine } from '../mpesaImport';
import { withRule } from '../payeeLearning';
import {
  alreadyKnown,
  mayBeOwnAccount,
  ownAccountFor,
  savedGroups,
  teachDoneKey,
  suggestedCategories,
  teachableGroups,
  teachCategory,
  teachOwnAccount,
  teachSource,
  withOwnAccounts,
} from '../teachJamvi';

let next = 0;
const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: next++,
  status: 'ready',
  reason: null,
  receipt: `R${next}`,
  direction: 'out',
  type: null,
  amount: 500,
  description: 'Someone',
  date: '2026-09-01',
  fee: null,
  mpesaBalance: null,
  alreadyRecorded: null,
  ...over,
});

const times = (n: number, over: Partial<PreviewLine>) => Array.from({ length: n }, () => line(over));

describe('the regulars Jamvi asks about', () => {
  const jane = times(5, { type: 'person_payment', description: 'Jane Wanjiku', amount: 2000 });
  const kcb = times(3, { description: 'Kcb Paybill Ac (5846630)', amount: 10000 });
  const once = [line({ type: 'person_payment', description: 'Peter Otieno' })];
  const airtime = times(6, { type: 'airtime_purchase', description: 'Airtime' });
  const lines = [...jane, ...kcb, ...once, ...airtime];
  const choices = initialChoices(lines, [], ['Family support', 'Rent', 'Groceries']);

  it('are payees with two or more lines waiting, most lines first', () => {
    const groups = teachableGroups(lines, choices);
    expect(groups.map((group) => group.label)).toEqual(['Jane Wanjiku', 'Kcb Paybill Ac']);
    expect(groups[0]).toMatchObject({ kind: 'person', count: 5, total: 10000, direction: 'out' });
  });

  it('never asks about what Jamvi files by itself, like airtime', () => {
    expect(teachableGroups(lines, choices).some((group) => group.label.includes('Airtime'))).toBe(false);
  });

  it('keys a bank payment by the account it went to, so it can be the person\'s own', () => {
    const bank = teachableGroups(lines, choices).find((group) => group.kind === 'bank')!;
    expect(bank.key).toBe('#ref:5846630');
    expect(bank.reference).toBe('5846630');
    expect(mayBeOwnAccount(bank)).toBe(true);
  });

  it('drops a payee once it is answered, and one already taught by a rule', () => {
    const [janeGroup] = teachableGroups(lines, choices);
    const answered = teachCategory(choices, janeGroup, 'Family support');
    expect(teachableGroups(lines, answered).map((group) => group.label)).toEqual(['Kcb Paybill Ac']);
    const rules = withRule({}, 'Jane Wanjiku', 'Family support');
    expect(teachableGroups(lines, choices, rules).map((group) => group.label)).toEqual(['Kcb Paybill Ac']);
  });

  it('leaves out payees the person skipped', () => {
    expect(teachableGroups(lines, choices, {}, { skipped: new Set(['#ref:5846630']) }).map((group) => group.label)).toEqual(['Jane Wanjiku']);
  });

  it('files, checks and remembers every line of the payee under the answer', () => {
    const [janeGroup] = teachableGroups(lines, choices);
    const answered = teachCategory(choices, janeGroup, 'Family support');
    for (const one of jane) {
      expect(answered[one.index]).toMatchObject({ category: 'Family support', auto: false, confirmed: true, remember: true });
    }
    expect(answered[once[0].index].category).toBe(NOT_SURE_CATEGORY);
  });
});

describe('money in from a regular payer', () => {
  const employer = times(3, { direction: 'in', type: 'bank_receipt', description: 'Equity Bulk Account', amount: 50000 });
  const choices = initialChoices(employer, [], []);

  it('is asked about even though it starts checked as Not sure', () => {
    const groups = teachableGroups(employer, choices);
    expect(groups).toHaveLength(1);
    expect(groups[0].direction).toBe('in');
  });

  it('takes the income source the person names', () => {
    const [group] = teachableGroups(employer, choices);
    const answered = teachSource(choices, group, 7);
    expect(answered[employer[0].index]).toMatchObject({ incomeSourceId: 7, sourceAuto: false, confirmed: true });
    expect(teachableGroups(employer, answered)).toHaveLength(0);
  });
});

describe('the person\'s own accounts, known by number', () => {
  const accounts = [{ id: 3, name: 'KCB savings', accountNumber: '584-6630' }, { id: 4, name: 'Cash', accountNumber: null }];

  it('matches the account number M-Pesa wrote, ignoring how it was typed', () => {
    expect(ownAccountFor({ description: 'Kcb Paybill Ac (5846630)' }, accounts)?.id).toBe(3);
    expect(ownAccountFor({ description: 'Kcb Paybill Ac (1111111)' }, accounts)).toBeNull();
    // A short number is a code, not an account.
    expect(ownAccountFor({ description: 'Shop (123)' }, [{ id: 9, name: 'x', accountNumber: '123' }])).toBeNull();
  });

  it('makes every payment to it a move, already checked', () => {
    const lines = times(2, { description: 'Kcb Paybill Ac (5846630)', amount: 10000 });
    const moved = withOwnAccounts(lines, initialChoices(lines, [], []), accounts);
    expect(moved[lines[0].index]).toMatchObject({ transferTo: 3, confirmed: true });
    expect(teachableGroups(lines, moved)).toHaveLength(0);
  });

  it('teaching one makes its lines a move too', () => {
    const lines = times(2, { description: 'Kcb Paybill Ac (5846630)', amount: 10000 });
    const choices = initialChoices(lines, [], []);
    const [group] = teachableGroups(lines, choices);
    const answered = teachOwnAccount(choices, group, 3);
    expect(answered[lines[1].index]).toMatchObject({ transferTo: 3, confirmed: true });
  });

  it('changes nothing when no account has a number', () => {
    const lines = times(2, { description: 'Kcb Paybill Ac (5846630)' });
    const choices = initialChoices(lines, [], []);
    expect(withOwnAccounts(lines, choices, [{ id: 4, name: 'Cash' }])).toBe(choices);
  });
});

describe('what Jamvi already knows', () => {
  it('counts what it filed by itself, by kind, most first', () => {
    const lines = [
      ...times(3, { type: 'airtime_purchase', description: 'Airtime' }),
      ...times(2, { type: 'transaction_charge', description: 'Pay Bill Charge' }),
      line({ type: 'person_payment', description: 'Jane Wanjiku' }),
    ];
    const known = alreadyKnown(lines, initialChoices(lines, [], []));
    expect(known.of).toBe(6);
    expect(known.filed).toBe(5);
    expect(known.parts[0]).toEqual({ label: 'Airtime & bundles', count: 3 });
  });
});

describe('categories offered first', () => {
  it('for a person: the budget\'s family and household ones', () => {
    const group = { kind: 'person' } as Parameters<typeof suggestedCategories>[0];
    expect(suggestedCategories(group, ['Groceries', 'Family support', 'Rent', 'Fuel'], NOT_SURE_CATEGORY)).toEqual(['Family support', 'Rent']);
  });
});

describe('existing users: their saved Not sure entries, by payee', () => {
  let id = 0;
  const saved = (over: Partial<EntryToSort>): EntryToSort => ({ id: ++id, type: 'disbursement', direction: 'out', amount: 1000, date: '2026-08-01', description: 'Someone', ...over });
  const entries = [
    ...Array.from({ length: 4 }, () => saved({ description: 'Jane Wanjiku', amount: 1500 })),
    ...Array.from({ length: 2 }, () => saved({ description: 'Kcb Paybill Ac (5846630)', amount: 20000 })),
    saved({ description: 'Peter Otieno' }),
    ...Array.from({ length: 3 }, () => saved({ direction: 'in', type: 'deposit', description: 'Received from Acme Ltd', incomeSourceId: 5 })),
    ...Array.from({ length: 2 }, () => saved({ direction: 'in', type: 'deposit', description: 'Received from Mary Akinyi' })),
  ];

  it('are grouped into regulars, most entries first, one-offs left for Sort them out', () => {
    const groups = savedGroups(entries);
    expect(groups.map((group) => [group.label, group.count])).toEqual([['Jane Wanjiku', 4], ['Kcb Paybill Ac', 2], ['Mary Akinyi', 2]]);
    expect(groups[0].kind).toBe('person');
    expect(groups[1]).toMatchObject({ kind: 'bank', key: '#ref:5846630', reference: '5846630' });
    expect(groups[2].direction).toBe('in');
  });

  it('leave out money in that already has a source, and payees already taught', () => {
    expect(savedGroups(entries).some((group) => group.label.includes('Acme'))).toBe(false);
    const rules = withRule({}, 'Jane Wanjiku', 'Family support');
    expect(savedGroups(entries, rules).map((group) => group.label)).toEqual(['Kcb Paybill Ac', 'Mary Akinyi']);
  });

  it('are offered once per budget, remembered on the phone', () => {
    expect(teachDoneKey(12)).toBe('jamvi:teach-jamvi:v1:12');
  });
});

describe('where existing users find it', () => {
  const read = (path: string) => readFileSync(path, 'utf8');
  it('Home offers it in Waiting for you until it is done or put off', () => {
    const home = read('app/(tabs)/index.tsx');
    expect(home).toContain("testID: 'teach-jamvi-cta'");
    expect(home).toContain("router.push('/teach-jamvi' as never)");
    expect(home).toContain('AsyncStorage.getItem(teachDoneKey(group?.id))');
  });
  it('Settings opens it again, and the screen is registered', () => {
    expect(read('app/(tabs)/settings.tsx')).toContain('testID="open-teach-jamvi"');
    expect(read('app/_layout.tsx')).toContain('<Stack.Screen name="teach-jamvi"');
  });
  it('finishing or Later marks it done for the budget', () => {
    const screen = read('app/teach-jamvi.tsx');
    expect(screen).toContain("AsyncStorage.setItem(teachDoneKey(group?.id), 'done')");
    expect(screen).toContain('onClose={finish}');
  });
});
