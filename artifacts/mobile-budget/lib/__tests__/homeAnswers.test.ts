import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { homeAnswers } from '@/lib/homeAnswers';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// "Simple to understand, use and navigate": Home answers three questions.
describe('homeAnswers', () => {
  it('has, spent and a plain sentence for on track', () => {
    const answers = homeAnswers({ balance: 12000, spent: 3000, budget: 10000 });
    expect(answers.have).toBe(12000);
    expect(answers.spent).toBe(3000);
    expect(answers.track).toEqual({ tone: 'good', text: 'On track: KES 7,000 left this month' });
  });

  it('warns when most of the budget is gone', () => {
    expect(homeAnswers({ balance: 0, spent: 8000, budget: 10000 }).track).toEqual({
      tone: 'careful',
      text: 'Careful: only KES 2,000 left this month',
    });
  });

  it('says how far over, without a minus sign', () => {
    expect(homeAnswers({ balance: 0, spent: 12500, budget: 10000 }).track).toEqual({
      tone: 'over',
      text: 'You are over budget by KES 2,500',
    });
  });

  it('invites a budget instead of showing 0 of 0', () => {
    expect(homeAnswers({ balance: 5, spent: 0, budget: 0 }).track.tone).toBe('neutral');
    expect(homeAnswers({ balance: 5, spent: 0, budget: undefined }).track.text).toContain('Set a budget');
  });

  it('has no balance until there is a bank account', () => {
    expect(homeAnswers({ balance: undefined, spent: 1, budget: 1 }).have).toBeNull();
    expect(homeAnswers({ balance: null, spent: 1, budget: 1 }).have).toBeNull();
    expect(homeAnswers({ balance: -40, spent: 1, budget: 1 }).have).toBe(-40);
  });
});

describe('the answers are on both Home screens', () => {
  it('phone Home shows the card with the bank balance, month spending and budget', () => {
    const home = read('app/(tabs)/index.tsx');
    expect(home).toContain('<HomeAnswersCard');
    expect(home).toContain('balance={bankAccount?.balance}');
    expect(home).toContain('spent={summary?.totalSpent}');
    expect(home).toContain('budget={summary?.totalBudget}');
  });

  it('web overview shows the same card above the action buttons', () => {
    const dash = read('../family-budget/src/pages/dashboard.tsx');
    expect(dash.indexOf('<HomeAnswersCard')).toBeGreaterThan(-1);
    expect(dash.indexOf('<HomeAnswersCard')).toBeLessThan(dash.indexOf('id="dashboard-quick-actions"'));
  });

  it('the two apps give the same answers', () => {
    const phone = read('lib/homeAnswers.ts').replace(/'/g, '"');
    const web = read('../family-budget/src/lib/home-answers.ts');
    expect(web).toBe(phone);
  });

  it('the web quick actions use plain words', () => {
    const dash = read('../family-budget/src/pages/dashboard.tsx');
    expect(dash).toContain('label: "I received money"');
    expect(dash).toContain('label: "I spent money"');
    expect(dash).not.toContain('label: "Bank Deposit"');
  });
});
