/**
 * Month by month: what came in, what went out, and what changed - "a monthly
 * comparison especially on income and expenses with highlights" (7 Oct 2026).
 *
 * Built from reports the server already gives, so it says what Reports says:
 * income is the income-streams trend (Reports' "Income"), spending is the
 * spending trend (Home's "what did I spend": expenses and categorised bank and
 * M-Pesa payments, less a side hustle's costs).
 *
 * The month in progress is shown "so far" but never compared: half a month
 * against a whole one would always read as spending down. Highlights compare
 * the last complete month with the one before it.
 */

export type TrendMonthLike = { year: number; month: number; label: string };
export type SpendingMonth = TrendMonthLike & { totalSpent: number };
export type IncomeTrend = { months: TrendMonthLike[]; streams: Array<{ sourceName: string; amounts: number[] }> };
export type CategorySpend = { category: string; spentAmount: number; parentName?: string | null };

export type MonthRow = {
  year: number;
  month: number;
  label: string;
  income: number;
  spent: number;
  net: number;
  /** The month in progress: shown, not compared. */
  soFar: boolean;
};

export type Highlight = { tone: 'good' | 'bad' | 'neutral'; text: string };

const keyOf = (row: { year: number; month: number }) => `${row.year}-${row.month}`;

/** One row a month, oldest first, from the spending trend and the income trend. */
export function comparisonRows(spending: readonly SpendingMonth[], income: IncomeTrend | undefined, today: { year: number; month: number }): MonthRow[] {
  const incomeByMonth = new Map<string, number>();
  (income?.months ?? []).forEach((month, index) => {
    const total = (income?.streams ?? []).reduce((sum, stream) => sum + (Number(stream.amounts[index]) || 0), 0);
    incomeByMonth.set(keyOf(month), total);
  });
  return [...spending]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((month) => {
      const incomeTotal = Math.round(incomeByMonth.get(keyOf(month)) ?? 0);
      const spent = Math.round(Number(month.totalSpent) || 0);
      return {
        year: month.year,
        month: month.month,
        label: month.label,
        income: incomeTotal,
        spent,
        net: incomeTotal - spent,
        soFar: month.year === today.year && month.month === today.month,
      };
    });
}

/** The last complete month and the one before it, when there are both. */
export function comparedPair(rows: readonly MonthRow[]): { latest: MonthRow; previous: MonthRow } | null {
  const complete = rows.filter((row) => !row.soFar);
  if (complete.length < 2) return null;
  return { latest: complete[complete.length - 1], previous: complete[complete.length - 2] };
}

const kes = (value: number) => `KES ${Math.round(Math.abs(value)).toLocaleString('en-KE')}`;
const shortName = (label: string) => label.split(' ')[0];

function change(now: number, before: number): string {
  const diff = now - before;
  const pct = before > 0 ? ` (${Math.round((Math.abs(diff) / before) * 100)}%)` : '';
  return `${diff >= 0 ? 'up' : 'down'} ${kes(diff)}${pct}`;
}

/** Leaf categories only: a heading's total is its subcategories again. */
function leafSpend(rows: readonly CategorySpend[] | undefined): Map<string, number> {
  const all = rows ?? [];
  const headings = new Set(all.map((row) => row.parentName).filter((name): name is string => Boolean(name)));
  const spend = new Map<string, number>();
  for (const row of all) {
    if (headings.has(row.category)) continue;
    spend.set(row.category, (spend.get(row.category) ?? 0) + (Number(row.spentAmount) || 0));
  }
  return spend;
}

/** The categories whose spending moved most between the two months, biggest first. */
export function categoryMovers(latest: readonly CategorySpend[] | undefined, previous: readonly CategorySpend[] | undefined, limit = 2) {
  const now = leafSpend(latest);
  const before = leafSpend(previous);
  const names = new Set([...now.keys(), ...before.keys()]);
  const moves = [...names].map((category) => ({ category, now: now.get(category) ?? 0, before: before.get(category) ?? 0 }))
    .map((move) => ({ ...move, diff: move.now - move.before }))
    .filter((move) => Math.abs(move.diff) >= 1);
  const up = moves.filter((move) => move.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, limit);
  const down = moves.filter((move) => move.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, limit);
  return { up, down };
}

/** What is worth saying about these months, most important first. */
export function monthlyHighlights(
  rows: readonly MonthRow[],
  categories?: { latest?: readonly CategorySpend[]; previous?: readonly CategorySpend[] },
  income?: IncomeTrend,
): Highlight[] {
  const pair = comparedPair(rows);
  if (!pair) return [];
  const { latest, previous } = pair;
  const name = shortName(latest.label);
  const before = shortName(previous.label);
  const out: Highlight[] = [];

  out.push({
    tone: latest.net >= 0 ? 'good' : 'bad',
    text: latest.net >= 0
      ? `In ${name} you kept ${kes(latest.net)}: ${kes(latest.income)} came in and ${kes(latest.spent)} went out.`
      : `In ${name} you spent ${kes(latest.net)} more than came in (${kes(latest.income)} in, ${kes(latest.spent)} out).`,
  });
  if (latest.income !== previous.income) {
    out.push({ tone: latest.income > previous.income ? 'good' : 'bad', text: `Income ${change(latest.income, previous.income)} on ${before}.` });
  }
  if (latest.spent !== previous.spent) {
    out.push({ tone: latest.spent < previous.spent ? 'good' : 'bad', text: `Spending ${change(latest.spent, previous.spent)} on ${before}.` });
  }

  const movers = categoryMovers(categories?.latest, categories?.previous, 1);
  for (const move of movers.up) {
    out.push({ tone: 'bad', text: `${move.category} rose the most: ${kes(move.before)} in ${before}, ${kes(move.now)} in ${name}.` });
  }
  for (const move of movers.down) {
    out.push({ tone: 'good', text: `${move.category} fell the most: ${kes(move.before)} in ${before}, ${kes(move.now)} in ${name}.` });
  }

  // The income stream that changed most between the two months.
  if (income) {
    const at = (month: MonthRow) => income.months.findIndex((entry) => entry.year === month.year && entry.month === month.month);
    const now = at(latest);
    const then = at(previous);
    if (now >= 0 && then >= 0) {
      const moved = income.streams
        .map((stream) => ({ name: stream.sourceName, diff: (Number(stream.amounts[now]) || 0) - (Number(stream.amounts[then]) || 0) }))
        .filter((stream) => Math.abs(stream.diff) >= 1)
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0];
      if (moved) out.push({ tone: moved.diff > 0 ? 'good' : 'bad', text: `${moved.name} brought in ${kes(moved.diff)} ${moved.diff > 0 ? 'more' : 'less'} than in ${before}.` });
    }
  }

  const complete = rows.filter((row) => !row.soFar);
  if (complete.length >= 3) {
    const average = complete.reduce((sum, row) => sum + row.spent, 0) / complete.length;
    if (average > 0 && Math.abs(latest.spent - average) / average >= 0.1) {
      const pct = Math.round((Math.abs(latest.spent - average) / average) * 100);
      out.push({ tone: latest.spent > average ? 'bad' : 'good', text: `${name}'s spending was ${pct}% ${latest.spent > average ? 'above' : 'below'} your ${complete.length}-month average of ${kes(average)}.` });
    }
    const best = [...complete].sort((a, b) => b.net - a.net)[0];
    if (best.net > 0) out.push({ tone: 'neutral', text: `Best month: ${best.label}, when you kept ${kes(best.net)}.` });
    const short = complete.filter((row) => row.net < 0).length;
    if (short > 0) out.push({ tone: short > complete.length / 2 ? 'bad' : 'neutral', text: `In ${short} of the last ${complete.length} months you spent more than came in.` });
  }
  return out;
}
