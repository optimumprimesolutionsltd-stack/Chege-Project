import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  chooseOtherBudget,
  confirmableLines,
  isConfirmedToSave,
  reviewStatus,
  sendableLines,
  sendLinesToOtherBudget,
  type Choice,
  type PreviewLine,
} from '@/lib/mpesaImport';
import {
  applyOtherBudgetRules,
  otherBudgetRuleFor,
  parseOtherBudgetRules,
  withOtherBudgetRule,
  withoutOtherBudgetRule,
  type OtherBudgetRule,
} from '@/lib/otherBudgetRules';

const line = (index: number, over: Partial<PreviewLine> = {}): PreviewLine => ({
  index, status: 'ready', reason: null, receipt: `R${index}`, direction: 'out', type: 'paybill',
  amount: 1000, description: 'Umoja Chama', date: '2026-09-01', fee: 0, mpesaBalance: null, alreadyRecorded: null,
  ...over,
});
const chama: OtherBudgetRule = { groupId: 7, groupName: 'Umoja Chama', accountId: 70, accountName: 'Chama M-Pesa', category: 'Monthly share' };

// Asked for: "Send all found to [chama]", and Jamvi remembering that a payee
// belongs to another budget (the chama) rather than this one.
describe('sending found entries to a chama', () => {
  const lines = [
    line(1),
    line(2, { direction: 'in', type: 'received', description: 'Umoja Chama' }),
    line(3, { type: 'transaction_charge', description: 'M-Pesa charge' }),
    line(4, { type: 'fuliza_repaid' }),
  ];
  const choices: Record<number, Choice> = {
    1: { include: true, category: 'Food', auto: true },
    2: { include: true, category: '' },
    3: { include: true, category: 'Charges', auto: true },
    4: { include: true, category: '' },
  };

  it('offers only lines that could go to another budget - not charges or Fuliza', () => {
    expect(sendableLines(lines, choices).map((item) => item.index)).toEqual([1, 2]);
  });

  it('sends money out with its category there and money in with its income source, all counted as confirmed', () => {
    const sent = sendLinesToOtherBudget(sendableLines(lines, choices), choices, { ...chama, incomeSourceId: 9 });
    expect(sent[1].otherBudget).toEqual({ groupId: 7, groupName: 'Umoja Chama', accountId: 70, accountName: 'Chama M-Pesa', category: 'Monthly share' });
    expect(sent[2].otherBudget).toEqual({ groupId: 7, groupName: 'Umoja Chama', accountId: 70, accountName: 'Chama M-Pesa', incomeSourceId: 9 });
    expect(isConfirmedToSave(lines[0], sent[1])).toBe(true);
    expect(sent[1].remember).toBe(true);
    expect(sent[3]).toBe(choices[3]);
  });
});

describe('remembering that a payee belongs to the chama', () => {
  it('keeps it by till or paybill number and by name, and reads it back', () => {
    const rules = withOtherBudgetRule({}, line(1, { payeeNumber: '123456' }), chama);
    expect(Object.keys(rules).sort()).toEqual(['#123456', 'umoja chama']);
    expect(otherBudgetRuleFor(line(5, { description: 'UMOJA CHAMA LTD', payeeNumber: '123456' }), rules)?.rule.groupId).toBe(7);
    expect(parseOtherBudgetRules(JSON.stringify(rules))).toEqual(rules);
    expect(parseOtherBudgetRules('{"x":{"groupId":"7"}}')).toEqual({});
    expect(withoutOtherBudgetRule(rules, line(1, { payeeNumber: '123456' }))).toEqual({});
  });

  it('suggests the chama next time, waiting for the person to confirm it', () => {
    const rules = withOtherBudgetRule({}, line(1), chama);
    const next = applyOtherBudgetRules([line(1)], { 1: { include: true, category: 'Food', auto: true } }, rules, [7]);
    expect(next[1].otherBudget?.groupName).toBe('Umoja Chama');
    expect(reviewStatus(line(1), next[1])).toBe('suggested');
    expect(isConfirmedToSave(line(1), next[1])).toBe(false);
    expect(confirmableLines([line(1)], next).length).toBe(1);
    // A line with no suggestion at all is still given the remembered budget.
    expect(applyOtherBudgetRules([line(1)], { 1: { include: true, category: '', auto: false } }, rules, [7])[1].otherBudgetAuto).toBe(true);
  });

  it('never overrides the person: a hand-picked category, a "No", a budget they no longer run', () => {
    const rules = withOtherBudgetRule({}, line(1), chama);
    expect(applyOtherBudgetRules([line(1)], { 1: { include: true, category: 'Rent', auto: false } }, rules, [7])[1].otherBudget).toBeUndefined();
    const saidNo = chooseOtherBudget({ 1: { include: true, category: 'Food', auto: true } }, 1, null);
    expect(applyOtherBudgetRules([line(1)], saidNo, rules, [7])[1].otherBudget).toBeNull();
    expect(applyOtherBudgetRules([line(1)], { 1: { include: true, category: 'Food', auto: true } }, rules, [8])[1].otherBudget).toBeUndefined();
  });

  it('counts a budget the person picked themselves as their choice', () => {
    const picked = chooseOtherBudget({ 1: { include: true, category: '' } }, 1, chama);
    expect(picked[1].otherBudgetAuto).toBe(false);
    expect(reviewStatus(line(1), picked[1])).toBe('changed');
  });
});

describe('the import screens offer both, phone and web', () => {
  const phone = readFileSync('app/mpesa-import.tsx', 'utf8');
  const web = readFileSync('../family-budget/src/pages/mpesa-import.tsx', 'utf8');

  it('sends everything found to a budget the person runs, after asking', () => {
    for (const screen of [phone, web]) {
      expect(screen).toContain('const toSend = find.trim() ? sendableLines(inView, choices) : [];');
      expect(screen).toContain('sendLinesToOtherBudget(toSend, current, target)');
      expect(screen).toContain('mpesa-review-send-go');
    }
    expect(phone).toContain('`Send all ${toSend.length} to ${otherManagedBudgets[0].name}`');
  });

  it('suggests a remembered budget, remembers on save, and lists it to forget', () => {
    for (const screen of [phone, web]) {
      expect(screen).toContain('applyOtherBudgetRules(lines, current, otherRules, managedIds)');
      expect(screen).toContain('keptOther = withOtherBudgetRule(keptOther, item, choice.otherBudget);');
      expect(screen).toContain('keptOther = withoutOtherBudgetRule(keptOther, item);');
      expect(screen).toContain('keepOtherRules(withoutOtherBudgetRule(otherRules, key))');
      expect(screen).toContain('rememberOtherBudgetLabel(item, choice.otherBudget.groupName)');
    }
  });
});
