/**
 * The sums the Budget tab shows so a plan can be shaped without a calculator:
 * what is budgeted against what is expected to come in, and what a change to
 * one figure does to both.
 */

const kes = (n: number) => Math.round(n).toLocaleString('en-KE');

/** "KES 12,000 left to plan" or "KES 3,000 over expected income", or null with no income set. */
export function leftToPlan(planned: number, expectedIncome: number): { text: string; over: boolean } | null {
  if (!(expectedIncome > 0)) return null;
  const left = expectedIncome - planned;
  if (Math.abs(left) < 1) return { text: 'Every shilling of expected income is planned', over: false };
  return left > 0
    ? { text: `KES ${kes(left)} left to plan`, over: false }
    : { text: `KES ${kes(-left)} more than expected income`, over: true };
}

/**
 * The household plan with one category's figure changed: the total it becomes,
 * and how far that moves it. `current` is what the category holds now (0 for a
 * new one).
 */
export function planWith(plannedTotal: number, current: number, typed: string) {
  const next = Math.max(0, Math.round(Number(typed.replace(/[,\s]/g, '')) || 0));
  const total = plannedTotal - current + next;
  return { total, change: total - plannedTotal };
}

/** Income figures, typed or saved, added up; a draft that is not a number counts as 0. */
export function incomeTotal(sources: ReadonlyArray<{ id: number; expectedMonthlyAmount?: number | null }>, drafts: Readonly<Record<number, string>> = {}) {
  return sources.reduce((sum, source) => {
    const draft = drafts[source.id];
    const amount = draft !== undefined ? Math.max(0, Math.round(Number(draft.replace(/[,\s]/g, '')) || 0)) : source.expectedMonthlyAmount ?? 0;
    return sum + amount;
  }, 0);
}
