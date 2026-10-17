import { earnsWord, type EarnsFrom } from './businessEarns';

/**
 * "Do you pay yourself a salary from it?" - asked once for each business,
 * during Teach Jamvi and on My businesses. Every business, profit counted or
 * not: one whose money only passes through the phone can still pay a salary
 * ("optimum and ujenzi" had no way to say so, 15 Oct 2026).
 *
 * - Yes: the salary is the person's income (an income stream, as "Ujenzi
 *   salary" always was); the business's profit stays in its Business report.
 * - No: the person lives on the business, so its profit - sales less costs -
 *   is their income: one line on All income ("if a business's profit is
 *   tracked, its profit counts as an income stream", 9 Oct 2026).
 *
 * Either way its costs stay out of household spending, and counting both a
 * salary and the profit it came out of never happens (api-server
 * lib/business-streams ownerIncomeBusinessIds).
 */
export type SalaryBusiness = { id: number; name: string; countsProfit: boolean; paysSalary?: boolean | null; earnsFrom?: EarnsFrom };

export const SALARY_ANSWERS: ReadonlyArray<{ label: string; paysSalary: boolean }> = [
  { label: 'Yes, a salary', paysSalary: true },
  { label: 'No, I live on its profit', paysSalary: false },
];

/**
 * The answers for one business: living on its profit only means something when
 * its profit is counted; otherwise it is a salary, or nothing from it is income.
 */
export function salaryAnswers(business: SalaryBusiness): ReadonlyArray<{ label: string; paysSalary: boolean }> {
  return business.countsProfit ? SALARY_ANSWERS : [SALARY_ANSWERS[0], { label: 'No', paysSalary: false }];
}

/** Businesses still to be asked: nobody has said yet. */
export const unansweredBusinesses = <B extends SalaryBusiness>(list: readonly B[]): B[] =>
  list.filter((business) => business.paysSalary === null || business.paysSalary === undefined);

/** What the answer means for the person's figures, in a sentence. */
export function salaryAnswerHint(business: SalaryBusiness): string {
  if (!business.countsProfit) {
    if (business.paysSalary === true) return `Your salary is your income - file your pay under your ${business.name} salary. The rest of its money only passes through.`;
    if (business.paysSalary === false) return `Nothing from ${business.name} counts as your income: its money only passes through.`;
    return `Until you say, nothing from ${business.name} counts as your income.`;
  }
  if (business.paysSalary === true) return `Your salary is your income - file your pay under your ${business.name} salary. ${business.name}'s profit stays in its Business report.`;
  if (business.paysSalary === false) return `${business.name}'s profit - ${earnsWord(business)} less costs - counts as your income.`;
  return `Until you say, ${business.name}'s profit stays in its Business report and out of your income.`;
}
