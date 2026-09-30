/**
 * What the Contributions view says about the numbers, not only the numbers:
 * how far each member is from what is expected, how the month compares with
 * the one before, and where each member's money came from.
 */

export type MemberBreakdown = {
  expenses: Array<{ id: number; description: string | null; amount: number; category?: string | null; date: string | null }>;
  deposits: Array<{ id: number; description: string | null; amount: number; date: string | null }>;
  savingsContributions: Array<{ id: number; goalName: string | null; amount: number; date: string | null }>;
  totals: { expenses: number; deposits: number; savings: number; grand: number };
};

export type BreakdownEntry = { key: string; date: string | null; label: string; kind: 'Money in' | 'Paid for' | 'Saved to'; amount: number };

const kes = (n: number) => Math.round(n).toLocaleString('en-KE');

/** Against the month's expected figure: the share done and what is left, or null with no target. */
export function targetProgress(contributed: number, target: number | null | undefined) {
  if (target == null || !(target > 0)) return null;
  const share = Math.max(0, Math.min(1, contributed / target));
  const left = Math.max(0, target - contributed);
  return {
    share,
    met: contributed >= target,
    label: contributed >= target
      ? contributed > target ? `Target met · KES ${kes(contributed - target)} over` : 'Target met'
      : `KES ${kes(left)} to go of KES ${kes(target)}`,
  };
}

/** "▲ KES 40,000 more than Aug", or null when there is nothing to compare with. */
export function versusLastMonth(current: number, previous: number | null | undefined, previousMonthName: string) {
  if (previous == null) return null;
  if (previous === 0 && current === 0) return null;
  const change = current - previous;
  if (Math.abs(change) < 1) return { up: null, text: `Same as ${previousMonthName}` };
  return {
    up: change > 0,
    text: `${change > 0 ? '▲' : '▼'} KES ${kes(Math.abs(change))} ${change > 0 ? 'more' : 'less'} than ${previousMonthName}`,
  };
}

/** Each way a member's money came in, biggest first, leaving out the empty ones. */
export function sourceParts(totals: MemberBreakdown['totals'] | undefined) {
  if (!totals) return [];
  return [
    { label: 'Money in', amount: totals.deposits },
    { label: 'Paid for expenses', amount: totals.expenses },
    { label: 'Saved', amount: totals.savings },
  ].filter((part) => part.amount > 0).sort((a, b) => b.amount - a.amount);
}

/** One list of what a member put in, newest first. */
export function breakdownEntries(breakdown: MemberBreakdown | undefined): BreakdownEntry[] {
  if (!breakdown) return [];
  return [
    ...breakdown.deposits.map((row) => ({ key: `d${row.id}`, date: row.date, label: row.description?.trim() || 'Deposit', kind: 'Money in' as const, amount: row.amount })),
    ...breakdown.expenses.map((row) => ({ key: `e${row.id}`, date: row.date, label: row.description?.trim() || row.category || 'Expense', kind: 'Paid for' as const, amount: row.amount })),
    ...breakdown.savingsContributions.map((row) => ({ key: `s${row.id}`, date: row.date, label: row.goalName?.trim() || 'Savings goal', kind: 'Saved to' as const, amount: row.amount })),
  ].sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
}

/** Standalone contributions under a heading per day they were recorded, newest first. */
export type DayHeading = { kind: 'day'; day: string; total: number; count: number };

export function contributionsByDay<T extends { id: number; createdAt: string; amount: number }>(rows: readonly T[]) {
  const sorted = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const out: Array<DayHeading | { kind: 'row'; item: T }> = [];
  let heading: DayHeading | null = null;
  for (const item of sorted) {
    const day = item.createdAt.slice(0, 10);
    if (!heading || heading.day !== day) {
      heading = { kind: 'day', day, total: 0, count: 0 };
      out.push(heading);
    }
    heading.total += Number(item.amount) || 0;
    heading.count += 1;
    out.push({ kind: 'row', item });
  }
  return out;
}
