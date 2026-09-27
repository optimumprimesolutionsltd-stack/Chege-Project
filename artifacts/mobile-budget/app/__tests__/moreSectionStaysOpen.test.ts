import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/mpesa-import.tsx', 'utf8');

// Reported: choosing "No" on the transfer/savings/other-budget question, or
// clearing a debt, was confusing because the whole "More" section vanished
// instead of revealing the other destination options. The transfer, savings
// and other-budget blocks all sit behind one shared gate that stays open
// only while destinationOf(choice) !== 'category' (or openMore was already
// set) - clearing back to a plain category made that gate false again,
// closing the section on the very options someone was trying to switch to.
describe('the "More" destination section stays open after clearing a choice', () => {
  it('marks the line as opened right before choosing (or clearing) a transfer', () => {
    expect(source).toContain('setChoices((current) => chooseTransfer(current, item.index, option.id));');
    const transferOnPress = source.slice(source.indexOf('chooseTransfer(current, item.index, option.id)') - 200, source.indexOf('chooseTransfer(current, item.index, option.id)'));
    expect(transferOnPress).toContain('setOpenMore((current) => new Set(current).add(item.index));');
  });

  it('marks the line as opened right before choosing (or clearing) a savings choice', () => {
    expect(source).toContain('setChoices((current) => chooseSavings(current, item.index, option.id));');
    const savingsOnPress = source.slice(source.indexOf('chooseSavings(current, item.index, option.id)') - 200, source.indexOf('chooseSavings(current, item.index, option.id)'));
    expect(savingsOnPress).toContain('setOpenMore((current) => new Set(current).add(item.index));');
  });

  it('marks the line as opened right before choosing (or clearing) a different budget', () => {
    expect(source).toContain('setChoices((current) => chooseOtherBudget(current, item.index, null));');
    const otherBudgetOnPress = source.slice(source.indexOf('setChoices((current) => chooseOtherBudget(current, item.index, null))') - 200, source.indexOf('setChoices((current) => chooseOtherBudget(current, item.index, null))'));
    expect(otherBudgetOnPress).toContain('setOpenMore((current) => new Set(current).add(item.index));');
  });

  it('marks the line as opened when clearing a debt from the sheet', () => {
    expect(source).toContain('setOpenMore((current) => new Set(current).add(debtFor.index));');
  });

  it('sets openMore at exactly five call sites: the "More" toggle itself, plus one per destination that can revert a line to a plain category', () => {
    // A sixth appearing (or one going missing) means a new destination was
    // added, or an old fix silently removed, without this same treatment.
    expect(source.match(/setOpenMore\(\(current\) => new Set\(current\)\.add\(/g)?.length).toBe(5);
  });
});
