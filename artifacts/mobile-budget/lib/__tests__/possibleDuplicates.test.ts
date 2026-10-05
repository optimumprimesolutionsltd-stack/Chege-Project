import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  alreadyFromMpesaMessage,
  initialChoices,
  mergeTwins,
  twinNotes,
  twinQuestions,
  untickElsewhere,
  withTwins,
  type PreviewLine,
} from '../mpesaImport';
import { categoryToKeep, deletePathFor, duplicatesTitle, sameQuestion, type DuplicatePair } from '../possibleDuplicates';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const line = (over: Partial<PreviewLine>): PreviewLine => ({
  index: 0, status: 'ready', reason: null, receipt: 'TESTDUP001', direction: 'out', type: 'merchant_payment', amount: 300,
  description: 'Mama Oliech', date: '2026-10-03', fee: null, mpesaBalance: 0, alreadyRecorded: null, ...over,
});

// "what we want to avoid is a duplicate of entries" (5 Oct 2026).
describe('a line that may be a payment recorded before', () => {
  const lines = [line({ index: 0 }), line({ index: 1, receipt: 'TESTDUP002', amount: 500 }), line({ index: 2, receipt: 'TESTDUP003', status: 'skipped' })];

  it('asks the server about recordable lines only, by amount, date and direction', () => {
    expect(twinQuestions(lines)).toEqual([
      { key: '0', amount: 300, date: '2026-10-03', direction: 'out' },
      { key: '1', amount: 500, date: '2026-10-03', direction: 'out' },
    ]);
  });

  it('carries what was found: a typed entry that looks the same, and another budget with the code', () => {
    const found = withTwins(lines, [{ key: '0', entries: [{ description: 'Lunch', date: '2026-10-03', amount: 300 }] }], [{ receipt: 'TESTDUP002', budget: 'Chama' }]);
    expect(found[0].typedTwin).toEqual({ description: 'Lunch', date: '2026-10-03', amount: 300 });
    expect(found[1].elsewhere).toBe('Chama');
    expect(twinNotes(found[0])[0]).toContain('Looks like "Lunch" (KES 300) you typed on 2026-10-03');
    expect(twinNotes(found[1])[0]).toContain('Already saved in Chama');
    expect(twinNotes(found[2])).toEqual([]);
  });

  it('starts a code already in another budget unticked', () => {
    const found = withTwins(lines, [], [{ receipt: 'TESTDUP002', budget: 'Chama' }]);
    const choices = initialChoices(found, [], ['Food']);
    expect([choices[0].include, choices[1].include]).toEqual([true, false]);
  });

  it('unticks it too when found after the choices were made, unless the person already chose', () => {
    const found = withTwins(lines, [], [{ receipt: 'TESTDUP002', budget: 'Chama' }]);
    const made = { 0: { include: true, category: 'Food' }, 1: { include: true, category: 'Food' } };
    expect(untickElsewhere(found, made)[1].include).toBe(false);
    expect(untickElsewhere(found, { ...made, 1: { include: true, category: 'Food', confirmed: true } })[1].include).toBe(true);
  });

  it('puts what was found on the lines on screen without undoing anything else', () => {
    const onScreen = [{ ...lines[0], description: 'Renamed' }];
    const merged = mergeTwins(onScreen, withTwins(lines, [{ key: '0', entries: [{ description: 'Lunch', date: '2026-10-03', amount: 300 }] }], []));
    expect(merged?.[0]).toMatchObject({ description: 'Renamed', typedTwin: { description: 'Lunch' } });
    expect(mergeTwins(null, lines)).toBeNull();
  });
});

// "a warning when something that the APP has picked is picked again" (5 Oct 2026).
describe('typing a payment Jamvi already has from M-Pesa', () => {
  it('says what is already there and that saving again counts it twice', () => {
    const { title, message } = alreadyFromMpesaMessage([{ description: 'Naivas', date: '2026-10-03', amount: 1200, receipt: 'TESTDUP009' }]);
    expect(title).toBe('Already in from M-Pesa?');
    expect(message).toContain('- Naivas (KES 1,200) on 2026-10-03, M-Pesa TESTDUP009');
    expect(message).toContain('would count it twice');
  });

  it('is asked before every hand-typed payment is saved, on the phone and the web', () => {
    for (const file of ['app/add-expense.tsx', 'app/(tabs)/bank.tsx', '../family-budget/src/pages/expenses.tsx', '../family-budget/src/pages/dashboard.tsx']) {
      expect(read(file)).toContain('confirmNotAlreadyFromMpesa({');
    }
    // Only new entries: an edit is the same payment by definition.
    expect(read('app/(tabs)/bank.tsx')).toContain("editingTransactionId === null &&\n      (txType === 'deposit' || txType === 'disbursement') &&");
  });

  it('covers moves too: savings in and out, transfers between accounts on both sides, and Contribute', () => {
    const phoneBank = read('app/(tabs)/bank.tsx');
    const webBank = read('../family-budget/src/pages/bank.tsx');
    expect(phoneBank).toContain("goalId: selectedGoal.id }))");
    expect(webBank).toContain('goalId: transferGoalId }))) return;');
    for (const source of [phoneBank, webBank]) {
      expect(source).toMatch(/direction: ['"]out['"], accountId: selectedAccountId \},\n\s+\{ amount: \w+, date, direction: ['"]in['"], accountId: bankTransferDestinationId \}/);
    }
    expect(read('app/(tabs)/goals.tsx')).toContain("direction: 'out', goalId: selectedGoal.id }))) return;");
    expect(read('../family-budget/src/pages/savings-goals.tsx')).toContain('direction: "out", goalId: goal.id }))) return;');
  });

  it('never stops a save when the check itself fails', () => {
    expect(read('lib/alreadyFromMpesa.ts')).toContain('} catch {\n    return true;\n  }');
    expect(read('../family-budget/src/lib/already-from-mpesa.ts')).toContain('} catch {\n    return true;\n  }');
  });
});

describe('settling a pair already saved', () => {
  const pair = (typed: Partial<DuplicatePair['typed']>, imported: Partial<DuplicatePair['imported']>): DuplicatePair => ({
    typed: { kind: 'expense', id: 4, date: '2026-10-02', amount: 300, description: 'Lunch', category: 'Food', receipt: null, ...typed },
    imported: { kind: 'imported', id: 9, date: '2026-10-03', amount: 300, description: 'Mama Oliech', category: 'Not sure yet', receipt: 'TESTDUP001', ...imported },
  });

  it('the M-Pesa entry takes the typed category only when it has none of its own', () => {
    expect(categoryToKeep(pair({}, {}))).toBe('Food');
    expect(categoryToKeep(pair({}, { category: null }))).toBe('Food');
    expect(categoryToKeep(pair({}, { category: 'Eating out' }))).toBeNull();
    expect(categoryToKeep(pair({ category: 'Not sure yet' }, {}))).toBeNull();
  });

  it('removes the typed one from where it lives', () => {
    expect(deletePathFor(pair({}, {}).typed)).toBe('/api/expenses/4');
    expect(deletePathFor(pair({ kind: 'entry', id: 7 }, {}).typed)).toBe('/api/joint-account/7');
  });

  it('says what will happen before it happens', () => {
    expect(sameQuestion(pair({}, {}))).toBe('"Lunch" you typed on 2026-10-02 will be removed.\n"Mama Oliech" from M-Pesa (TESTDUP001) stays and is filed under Food.');
    expect(duplicatesTitle(1)).toBe('1 payment may be recorded twice');
  });

  it('is reached from Home on the phone and the web', () => {
    expect(read('app/(tabs)/index.tsx')).toContain("router.push('/possible-duplicates' as never)");
    expect(read('app/_layout.tsx')).toContain('<Stack.Screen name="possible-duplicates"');
    expect(read('../family-budget/src/components/mpesa-import-card.tsx')).toContain('href="/possible-duplicates"');
    expect(read('../family-budget/src/App.tsx')).toContain('<Route path="/possible-duplicates" component={PossibleDuplicates} />');
  });
});
