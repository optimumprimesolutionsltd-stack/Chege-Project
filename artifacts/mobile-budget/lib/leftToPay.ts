/**
 * What is left on a category's budget once this payment is saved, said so the
 * person knows when to move on. Rent paid to someone in small amounts needs to
 * say when it is done ("i want to know when i have been able to fully pay for
 * rent to her so i can go to the next thing", 13 Oct 2026) - "KES 0 left"
 * never said it.
 *
 * Shown in Quick and Detailed alike on Log Expense, and the same words on the
 * Budget tab (budgetRowLeft).
 */
export type BalancePreview = {
  category: string;
  budgetAmount: number;
  spentBeforeExpense: number;
  remaining: number;
  overBy: number;
  isOverBudget: boolean;
};

export type LeftToPay = { text: string; tone: 'left' | 'paid' | 'over' };

const kes = (amount: number) => `KES ${Math.round(amount).toLocaleString('en-KE')}`;

export function leftToPayLine(preview: BalancePreview, monthName: string): LeftToPay {
  const { category, budgetAmount, spentBeforeExpense, remaining, overBy, isOverBudget } = preview;
  if (isOverBudget) {
    return spentBeforeExpense >= budgetAmount
      ? { tone: 'over', text: `${category} is already fully paid for ${monthName} (${kes(budgetAmount)}). This puts it ${kes(overBy)} over.` }
      : { tone: 'over', text: `This pays ${category} in full for ${monthName} and ${kes(overBy)} over the ${kes(budgetAmount)}.` };
  }
  if (remaining === 0) {
    return { tone: 'paid', text: `This pays ${category} in full for ${monthName} (${kes(budgetAmount)}). On to the next thing.` };
  }
  return {
    tone: 'left',
    text: spentBeforeExpense > 0
      ? `${kes(remaining)} left to pay on ${category} after this - ${kes(spentBeforeExpense)} of ${kes(budgetAmount)} paid before it.`
      : `${kes(remaining)} left to pay on ${category} after this, of ${kes(budgetAmount)}.`,
  };
}

/** A Budget tab row: "Fully paid" once spending meets the budget exactly, rather than "KES 0 left". */
export function budgetRowLeft(budget: number, spent: number): string {
  if (budget <= 0) return '';
  if (spent > budget) return `${kes(spent - budget)} over`;
  if (spent === budget) return 'Fully paid';
  return `${kes(budget - spent)} left`;
}


/**
 * The same preview for one payment typed anywhere - Money out on Bank as well
 * as Log Expense: "would also want to see pending balance as per budget when
 * entries are being made" (16 Oct 2026). Null when the category has no budget.
 */
export function previewFor(category: string, amount: number, budgetAmount: number | null | undefined, spentAmount: number | null | undefined): BalancePreview | null {
  const budget = Number(budgetAmount ?? 0);
  if (!category.trim() || !(amount > 0) || !(budget > 0)) return null;
  const spent = Number(spentAmount ?? 0);
  const after = Math.round((budget - spent - amount) * 100) / 100;
  return {
    category: category.trim(),
    budgetAmount: budget,
    spentBeforeExpense: spent,
    remaining: Math.max(0, after),
    overBy: Math.max(0, -after),
    isOverBudget: after < 0,
  };
}


/**
 * Money in against the month's budget: how much more has to come in to cover
 * it once this is saved - "can i also see balance to fulfill a budget in money
 * in" (16 Oct 2026), the income side of leftToPayLine. Null with no budget or
 * no amount yet.
 */
export function budgetFundingLine(totalBudget: number | null | undefined, receivedSoFar: number | null | undefined, amount: number, monthName: string): LeftToPay | null {
  const budget = Number(totalBudget ?? 0);
  if (!(budget > 0) || !(amount > 0)) return null;
  const after = Math.round((Number(receivedSoFar ?? 0) + amount) * 100) / 100;
  const short = Math.round((budget - after) * 100) / 100;
  if (short > 0) {
    return { tone: 'left', text: `After this, ${kes(short)} more to come in to cover ${monthName}'s budget of ${kes(budget)} (${kes(after)} in so far).` };
  }
  return short === 0
    ? { tone: 'paid', text: `This covers ${monthName}'s budget of ${kes(budget)} in full.` }
    : { tone: 'paid', text: `This covers ${monthName}'s budget of ${kes(budget)}, with ${kes(-short)} to spare.` };
}
