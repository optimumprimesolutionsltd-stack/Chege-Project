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
  it('phone Home shows the card with the M-Pesa balance, month spending and budget', () => {
    const home = read('app/(tabs)/index.tsx');
    expect(home).toContain('<HomeAnswersCard');
    // The M-Pesa account alone: every account added up mixed in business money (11 Oct 2026).
    expect(home).toContain('balance={mpesaSummary?.balance}');
    expect(read('components/HomeAnswersCard.tsx')).toContain("'How much is on my M-Pesa?'");
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

// "how much is on my mpesa? is wrong" (13 Oct 2026): Jamvi's figure is worked
// out from what was saved; M-Pesa's own message says what is really there.
describe("How much is on my M-Pesa? answers with M-Pesa's own figure", () => {
  it('uses the newest message when there is one, and says where it came from', async () => {
    const { readFileSync } = await import('node:fs');
    const card = readFileSync('components/HomeAnswersCard.tsx', 'utf8');
    expect(card).toContain('homeAnswers({ balance: live ? live.balance : balance, spent, budget })');
    expect(card).toContain('`From your M-Pesa message of ${messageTime(live.at)}`');
    expect(card).toContain("'As recorded in Jamvi'");
    const home = readFileSync('app/(tabs)/index.tsx', 'utf8');
    expect(home).toContain('live={personalBudget ? liveMpesa ?? null : null}');
    expect(home).toContain("queryKey: ['mpesa-live-balance'],");
  });
});

// "the jamvi mpesa balance is not actual ... 2027 is the correct figure" (15 Oct
// 2026): Bank's Balance now on the M-Pesa account said 204.65, Jamvi's own sum.
describe("Bank's M-Pesa account shows M-Pesa's own balance", () => {
  it('uses the newest message on the budget M-Pesa account, and says so', async () => {
    const { readFileSync } = await import('node:fs');
    const bank = readFileSync('app/(tabs)/bank.tsx', 'utf8');
    expect(bank).toContain("queryKey: ['mpesa-live-balance'],");
    expect(bank).toContain('mpesaSummary?.balanceAccountId === selectedAccount.id');
    expect(bank).toContain('periodSummary ? periodSummary.closing : liveBalance ? liveBalance.balance : data?.balance');
    expect(bank).toContain('From your M-Pesa message of {messageTime(liveBalance.at)}');
    // "why is the balance here not 1737.48": each entry's balance moves by the same gap.
    expect(bank).toContain('Balance KES {formatKES(item.runningBalance + balanceShift)}');
    expect(bank).toContain('Math.round((liveBalance.balance - data.balance) * 100) / 100');
  });
});
