/**
 * What stands out in a month, in a few plain sentences - "ensure user gets
 * great insights from the reports" (8 Oct 2026). Reports had the numbers but
 * spread over a dozen sections; this picks out what matters most and says it,
 * each with where to go to act on it. Worked out from the person's own
 * figures only, most important first, at most five.
 */

export type InsightAction = { kind: 'sort' } | { kind: 'ledger' } | { kind: 'income' };

export type Insight = {
  id: string;
  tone: 'warn' | 'good' | 'info';
  text: string;
  action: InsightAction;
};

type Category = { category: string; spentAmount: number };

export type InsightInput = {
  /** This month's spending by category. */
  current: readonly Category[];
  /** Last month's, to compare with. */
  previous: readonly Category[];
  previousLabel: string;
  totalSpent: number;
  totalBudget: number;
  /** Income that came in this month. */
  totalIncome: number;
  /** Day of the month today, when the month shown is this month; otherwise null. */
  dayOfMonth: number | null;
  daysInMonth: number;
  monthEndLabel: string;
};

const NOT_SURE = 'not sure yet';
// Charges, not fees in general: "School fees" is not a charge.
const FEES = /\b(charges?|fuliza|bank fees?|transaction (?:costs?|fees?))\b/i;
const kes = (value: number) => `KES ${Math.round(value).toLocaleString('en-KE')}`;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function reportInsights(input: InsightInput): Insight[] {
  const { current, previous, totalSpent, totalBudget, totalIncome } = input;
  const insights: Insight[] = [];
  if (totalSpent <= 0 && totalIncome <= 0) return insights;

  // 1. Money nobody has said what it was for hides the real picture.
  const notSure = current.find((row) => row.category.trim().toLowerCase() === NOT_SURE)?.spentAmount ?? 0;
  if (notSure > 0) {
    insights.push({
      id: 'not-sure',
      tone: 'warn',
      text: `${kes(notSure)} (${pct(notSure, totalSpent)}%) of what you spent is still Not sure. Sort it out to see where your money really went.`,
      action: { kind: 'sort' },
    });
  }

  // 2. Where this month is heading, while it is still running.
  if (input.dayOfMonth !== null && input.dayOfMonth >= 5 && input.dayOfMonth < input.daysInMonth && totalBudget > 0 && totalSpent > 0) {
    const projected = (totalSpent / input.dayOfMonth) * input.daysInMonth;
    if (projected > totalBudget * 1.05) {
      insights.push({
        id: 'pace',
        tone: 'warn',
        text: `At this pace you'll spend about ${kes(projected)} by ${input.monthEndLabel}, ${kes(projected - totalBudget)} over your budget.`,
        action: { kind: 'ledger' },
      });
    }
  }

  // 3. Spent against what came in.
  if (totalIncome > 0 && totalSpent > 0) {
    if (totalSpent > totalIncome) {
      insights.push({
        id: 'over-income',
        tone: 'warn',
        text: `You spent ${kes(totalSpent - totalIncome)} more than came in (${kes(totalIncome)} in, ${kes(totalSpent)} out).`,
        action: { kind: 'income' },
      });
    } else {
      insights.push({
        id: 'kept',
        tone: 'good',
        text: `You kept ${pct(totalIncome - totalSpent, totalIncome)}% of what came in: ${kes(totalIncome - totalSpent)} of ${kes(totalIncome)}.`,
        action: { kind: 'income' },
      });
    }
  }

  // 4. The biggest rise and fall on last month, by category - not counting Not sure.
  const before = new Map(previous.map((row) => [row.category, row.spentAmount]));
  const changes = current
    .filter((row) => row.category.trim().toLowerCase() !== NOT_SURE)
    .map((row) => ({ category: row.category, now: row.spentAmount, then: before.get(row.category) ?? 0 }))
    .map((row) => ({ ...row, change: row.now - row.then }));
  for (const row of previous) {
    if (row.category.trim().toLowerCase() !== NOT_SURE && !current.some((now) => now.category === row.category) && row.spentAmount > 0) {
      changes.push({ category: row.category, now: 0, then: row.spentAmount, change: -row.spentAmount });
    }
  }
  const meaningful = (row: (typeof changes)[number]) => Math.abs(row.change) >= 1000 && (row.then === 0 || Math.abs(row.change) / row.then >= 0.2);
  const rise = changes.filter((row) => row.change > 0 && meaningful(row)).sort((a, b) => b.change - a.change)[0];
  if (rise && previous.length > 0) {
    insights.push({
      id: 'rise',
      tone: 'warn',
      text: rise.then > 0
        ? `${rise.category}: ${kes(rise.now)}, up ${kes(rise.change)} (+${pct(rise.change, rise.then)}%) on ${input.previousLabel}.`
        : `${rise.category}: ${kes(rise.now)}, nothing in ${input.previousLabel}.`,
      action: { kind: 'ledger' },
    });
  }
  const fall = changes.filter((row) => row.change < 0 && meaningful(row)).sort((a, b) => a.change - b.change)[0];
  if (fall && previous.length > 0) {
    insights.push({
      id: 'fall',
      tone: 'good',
      text: `${fall.category}: ${kes(fall.now)}, down ${kes(-fall.change)} (−${pct(-fall.change, fall.then)}%) on ${input.previousLabel}.`,
      action: { kind: 'ledger' },
    });
  }

  // 5. Charges and fees, which add up unnoticed.
  const fees = current.filter((row) => FEES.test(row.category)).reduce((sum, row) => sum + row.spentAmount, 0);
  if (fees >= 100) {
    insights.push({
      id: 'fees',
      tone: 'info',
      text: `You paid ${kes(fees)} in charges and fees.`,
      action: { kind: 'ledger' },
    });
  }

  // 6. Where most of it went.
  const top = current
    .filter((row) => row.category.trim().toLowerCase() !== NOT_SURE)
    .sort((a, b) => b.spentAmount - a.spentAmount)[0];
  if (top && totalSpent > 0 && pct(top.spentAmount, totalSpent) >= 15) {
    insights.push({
      id: 'top',
      tone: 'info',
      text: `${top.category} took ${pct(top.spentAmount, totalSpent)}% of everything you spent (${kes(top.spentAmount)}).`,
      action: { kind: 'ledger' },
    });
  }

  return insights.slice(0, 5);
}
