import { describe, expect, it } from 'vitest';
import { formatInterestRate, rankDebtsForPayoff, type DebtCategory } from '../debts';

const FULIZA: DebtCategory = { id: 1, name: 'Fuliza', debtBalance: 3000, debtInterestRateBps: 1200 };
const SACCO_LOAN: DebtCategory = { id: 2, name: 'SACCO loan', debtBalance: 80000, debtInterestRateBps: 1400 };
const SHOPKEEPER: DebtCategory = { id: 3, name: 'Shopkeeper', debtBalance: 1500, debtInterestRateBps: null };
const RENT: DebtCategory = { id: 4, name: 'Rent', debtBalance: null, debtInterestRateBps: null };

describe('rankDebtsForPayoff', () => {
  it('excludes categories that are not tracked as a debt', () => {
    expect(rankDebtsForPayoff([FULIZA, RENT], 'snowball').map((d) => d.name)).toEqual(['Fuliza']);
  });

  it('orders by smallest balance first for the snowball strategy', () => {
    expect(rankDebtsForPayoff([SACCO_LOAN, FULIZA, SHOPKEEPER], 'snowball').map((d) => d.name))
      .toEqual(['Shopkeeper', 'Fuliza', 'SACCO loan']);
  });

  it('orders by highest interest rate first for the avalanche strategy', () => {
    expect(rankDebtsForPayoff([FULIZA, SACCO_LOAN, SHOPKEEPER], 'avalanche').map((d) => d.name))
      .toEqual(['SACCO loan', 'Fuliza', 'Shopkeeper']);
  });

  it('treats a debt with no rate set as 0% for avalanche ordering, not last by default sort', () => {
    // SHOPKEEPER has no rate; it should rank below both rated debts, not
    // crash or sort as if its rate were the largest (undefined coerced oddly).
    const ranked = rankDebtsForPayoff([SHOPKEEPER, FULIZA], 'avalanche');
    expect(ranked.map((d) => d.name)).toEqual(['Fuliza', 'Shopkeeper']);
  });

  it('returns an empty list when nothing is tracked as a debt', () => {
    expect(rankDebtsForPayoff([RENT], 'snowball')).toEqual([]);
  });
});

describe('formatInterestRate', () => {
  it('renders basis points as a percentage', () => {
    expect(formatInterestRate(1200)).toBe('12% per year');
  });

  it('says no rate is set for null', () => {
    expect(formatInterestRate(null)).toBe('No rate set');
  });
});
