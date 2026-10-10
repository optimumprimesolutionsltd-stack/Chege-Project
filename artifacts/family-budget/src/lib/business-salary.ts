/**
 * "Do you pay yourself a salary from it?" - asked once for each business whose
 * profit counts (My businesses), during Teach Jamvi and on My businesses.
 *
 * - Yes: the salary is the person"s income (an income stream, as "Ujenzi
 *   salary" always was); the business"s profit stays in its Business report.
 * - No: the person lives on the business, so its profit - sales less costs -
 *   is their income: one line on All income ("if a business"s profit is
 *   tracked, its profit counts as an income stream", 9 Oct 2026).
 *
 * Either way its costs stay out of household spending, and counting both a
 * salary and the profit it came out of never happens (api-server
 * lib/business-streams ownerIncomeBusinessIds).
 */
export type SalaryBusiness = { id: number; name: string; countsProfit: boolean; paysSalary?: boolean | null };

export const SALARY_ANSWERS: ReadonlyArray<{ label: string; paysSalary: boolean }> = [
  { label: "Yes, a salary", paysSalary: true },
  { label: "No, I live on its profit", paysSalary: false },
];

/** Businesses still to be asked: their profit counts, and nobody has said yet. */
export const unansweredBusinesses = <B extends SalaryBusiness>(list: readonly B[]): B[] =>
  list.filter((business) => business.countsProfit && (business.paysSalary === null || business.paysSalary === undefined));

/** What the answer means for the person"s figures, in a sentence. */
export function salaryAnswerHint(business: SalaryBusiness): string {
  if (business.paysSalary === true) return `Your salary is your income. ${business.name}"s profit stays in its Business report.`;
  if (business.paysSalary === false) return `${business.name}"s profit - sales less costs - counts as your income.`;
  return `Until you say, ${business.name}"s profit stays in its Business report and out of your income.`;
}
