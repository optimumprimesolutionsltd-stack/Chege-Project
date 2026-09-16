import { describe, expect, it } from 'vitest';
import { formatMonthKey, projectPayoff, summariseDebts, type DebtWithPayment } from '../debtSummary';

const FROM = new Date(2026, 8, 16); // 16 September 2026, local

const debt = (over: Partial<DebtWithPayment> & { id: number; name: string }): DebtWithPayment => ({
  debtBalance: 0,
  debtInterestRateBps: null,
  monthlyPayment: null,
  ...over,
});

describe('projectPayoff', () => {
  it('clears an interest-free debt in the obvious number of months', () => {
    const result = projectPayoff(10_000, 2_500, 0, FROM);
    expect(result.months).toBe(4);
    expect(result.clearsOn).toBe('2027-01');
    expect(result.interestCost).toBe(0);
  });

  it('counts a part month as a whole one, because that is when it clears', () => {
    // 10,000 at 3,000/month is three payments and a remainder.
    expect(projectPayoff(10_000, 3_000, 0, FROM).months).toBe(4);
  });

  it('charges interest and says what it cost', () => {
    const result = projectPayoff(100_000, 10_000, 1_200, FROM); // 12% a year
    expect(result.months).toBeGreaterThan(10); // more than the interest-free 10
    expect(result.interestCost).toBeGreaterThan(0);
    expect(result.clearsOn).not.toBeNull();
  });

  it('refuses to pretend when the interest outruns the payment', () => {
    // 1% a month on 100,000 is 1,000; paying 500 never reduces anything.
    const result = projectPayoff(100_000, 500, 1_200, FROM);
    expect(result.months).toBeNull();
    expect(result.clearsOn).toBeNull();
    expect(result.blockedBy).toBe('interest-outruns-payment');
  });

  it('says so plainly when nothing is being paid', () => {
    expect(projectPayoff(50_000, null, 0, FROM).blockedBy).toBe('no-payment');
    expect(projectPayoff(50_000, 0, 0, FROM).blockedBy).toBe('no-payment');
  });

  it('treats an already-cleared debt as done rather than unanswerable', () => {
    const result = projectPayoff(0, null, 1_200, FROM);
    expect(result.months).toBe(0);
    expect(result.blockedBy).toBeNull();
  });

  it('rolls the year over when the payoff crosses December', () => {
    expect(projectPayoff(10_000, 2_500, 0, new Date(2026, 10, 1)).clearsOn).toBe('2027-03');
  });
});

describe('summariseDebts', () => {
  const loan = debt({ id: 1, name: 'Bank loan', debtBalance: 120_000, debtInterestRateBps: 1_400, monthlyPayment: 15_000 });
  const chama = debt({ id: 2, name: 'Chama advance', debtBalance: 20_000, debtInterestRateBps: 0, monthlyPayment: 5_000 });
  const cleared = debt({ id: 3, name: 'Phone', debtBalance: 0, monthlyPayment: 2_000 });

  it('adds up only what is still owed', () => {
    const view = summariseDebts([loan, chama, cleared], 'snowball', FROM);
    expect(view.totalOwed).toBe(140_000);
    expect(view.monthlyCommitment).toBe(20_000);
  });

  it('keeps a cleared debt visible, because clearing one is the point', () => {
    expect(summariseDebts([loan, chama, cleared], 'snowball', FROM).clearedCount).toBe(1);
  });

  it('focuses the smallest balance under snowball', () => {
    expect(summariseDebts([loan, chama], 'snowball', FROM).focus?.name).toBe('Chama advance');
  });

  it('focuses the highest rate under avalanche', () => {
    expect(summariseDebts([loan, chama], 'avalanche', FROM).focus?.name).toBe('Bank loan');
  });

  it('reports debt-free as the month the LAST debt clears', () => {
    const view = summariseDebts([loan, chama], 'snowball', FROM);
    const alone = projectPayoff(120_000, 15_000, 1_400, FROM);
    expect(view.debtFreeOn).toBe(alone.clearsOn);
  });

  it('gives no date at all when one debt is going nowhere', () => {
    const stalled = debt({ id: 4, name: 'Shylock', debtBalance: 50_000, monthlyPayment: null });
    const view = summariseDebts([chama, stalled], 'snowball', FROM);
    expect(view.hasStalledDebt).toBe(true);
    // A date that quietly ignores the debt nobody is paying would be a lie.
    expect(view.debtFreeOn).toBeNull();
  });

  it('has nothing to say when there are no debts', () => {
    const view = summariseDebts([], 'snowball', FROM);
    expect(view.totalOwed).toBe(0);
    expect(view.focus).toBeNull();
    expect(view.debtFreeOn).toBeNull();
    expect(view.hasStalledDebt).toBe(false);
  });

  it('is finished when every debt is cleared', () => {
    const view = summariseDebts([cleared], 'snowball', FROM);
    expect(view.totalOwed).toBe(0);
    expect(view.clearedCount).toBe(1);
    expect(view.focus).toBeNull();
  });
});

describe('formatMonthKey', () => {
  it('says the month out loud', () => {
    expect(formatMonthKey('2027-03')).toBe('March 2027');
  });

  it('returns nothing for nothing', () => {
    expect(formatMonthKey(null)).toBeNull();
    expect(formatMonthKey('nonsense')).toBeNull();
  });
});
