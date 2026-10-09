import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SALARY_ANSWERS, salaryAnswerHint, unansweredBusinesses } from '../businessSalary';

// "If a business's profit is tracked, its profit counts as an income stream" (9 Oct 2026),
// asked once per business so a salary and the profit it came from are never both income.
describe('do you pay yourself a salary from it?', () => {
  const ujenzi = { id: 1, name: 'Ujenzi', countsProfit: true, paysSalary: null };
  const duka = { id: 2, name: 'Duka', countsProfit: true, paysSalary: false };
  const passing = { id: 3, name: 'Chama float', countsProfit: false, paysSalary: null };

  it('is asked only of a business whose profit counts and nobody has answered', () => {
    expect(unansweredBusinesses([ujenzi, duka, passing]).map((one) => one.name)).toEqual(['Ujenzi']);
    expect(unansweredBusinesses([{ id: 4, name: 'New', countsProfit: true }])).toHaveLength(1);
  });

  it('has two answers: a salary, or living on the profit', () => {
    expect(SALARY_ANSWERS.map((one) => one.paysSalary)).toEqual([true, false]);
  });

  it('says what each answer means for the figures', () => {
    expect(salaryAnswerHint({ ...ujenzi, paysSalary: true })).toContain('Your salary is your income');
    expect(salaryAnswerHint(duka)).toContain("Duka's profit - sales less costs - counts as your income");
    expect(salaryAnswerHint(ujenzi)).toContain('Until you say');
  });

  it('is asked in the M-Pesa review and kept on My businesses, on the server', () => {
    const read = (path: string) => readFileSync(path, 'utf8');
    expect(read('app/mpesa-import.tsx')).toContain('{lines && canManageBudget ? <BusinessSalaryQuestion /> : null}');
    expect(read('app/businesses.tsx')).toContain('testID={`business-pays-salary-${business.id}`}');
    expect(read('hooks/useBusinesses.ts')).toContain("body: JSON.stringify({ business: true, paysSalary }),");
  });
});
