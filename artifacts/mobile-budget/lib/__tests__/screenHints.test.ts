import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// Every screen says, in one plain sentence, what it is for.
describe('phone screens have a one-line hint under the title', () => {
  it.each([
    ['app/(tabs)/reports.tsx', 'See where your money came from and where it went.'],
    ['app/(tabs)/debt.tsx', 'Money you owe, and how close you are to paying it off.'],
    ['app/(tabs)/budget.tsx', 'Decide how much to spend on each thing, and see how you are doing.'],
    ['app/(tabs)/settings.tsx', 'Your account, your budget and who can see it.'],
    ['app/(tabs)/search.tsx', 'Type to find any expense, payment or goal.'],
    ['app/parties.tsx', 'Money you owe, and money other people owe you, in one list.'],
  ])('%s', (file, sentence) => {
    expect(read(file)).toContain(sentence);
  });
});

describe('web pages have a one-line hint under the title', () => {
  it.each([
    ['expenses.tsx', 'Everything you spent, and what it was for.'],
    ['budget.tsx', 'Decide how much to spend on each thing, and see how you are doing.'],
    ['activity.tsx', 'Everything that happened with your money, newest first.'],
    ['savings-goals.tsx', 'Save up for something you want, like a trip, a phone or a rainy day.'],
    ['parties.tsx', 'Money you owe, and money other people owe you, in one list.'],
    ['statement.tsx', "match it with your bank's own statement."],
    ['pass-through.tsx', 'Both debts get smaller and your balance stays the same.'],
    ['search.tsx', 'Type to find any expense, payment or goal'],
    ['contributions.tsx', 'Who has put money into the group, and how much.'],
  ])('%s', (file, sentence) => {
    expect(read(`../family-budget/src/pages/${file}`)).toContain(sentence);
  });

  it('none of the old jargon is left in those hints', () => {
    for (const file of ['parties.tsx', 'pass-through.tsx', 'statement.tsx', 'activity.tsx', 'contributions.tsx']) {
      const source = read(`../family-budget/src/pages/${file}`);
      expect(source).not.toContain('Everybody money stands between you');
      expect(source).not.toContain('joint-account movements');
    }
  });
});
