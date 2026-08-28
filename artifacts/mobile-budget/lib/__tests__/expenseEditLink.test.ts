import { describe, expect, it } from 'vitest';
import {
  getExpenseActivityEditHref,
  getExpenseEditHref,
  getLedgerExpenseEditHref,
} from '../expenseEditLink';

describe('expense edit links', () => {
  it('keeps the stable expense id and the expense month context', () => {
    expect(getExpenseEditHref({ id: 42, date: '2026-07-19' }))
      .toBe('/add-expense?edit=42&month=7&year=2026');
  });

  it('links expense activity while rejecting funding and non-expense activity', () => {
    expect(getExpenseActivityEditHref({
      id: 'expense-18',
      type: 'expense',
      editTarget: 'expense',
      date: '2026-01-03T12:00:00.000Z',
    })).toBe('/add-expense?edit=18&month=1&year=2026');

    expect(getExpenseActivityEditHref({
      id: 'expense-funding-18-2',
      type: 'expense',
      date: '2026-01-03',
    })).toBeNull();
    expect(getExpenseActivityEditHref({
      id: 'contribution-8',
      type: 'contribution',
      date: '2026-01-03',
    })).toBeNull();
  });

  it('never treats a bank disbursement ledger row as an expense', () => {
    expect(getLedgerExpenseEditHref({
      id: 'expense-9',
      source: 'expense',
      date: '2026-08-10',
    })).toBe('/add-expense?edit=9&month=8&year=2026');
    expect(getLedgerExpenseEditHref({
      id: 'bank-disbursement-9',
      source: 'bank_disbursement',
      date: '2026-08-10',
    })).toBeNull();
  });
});