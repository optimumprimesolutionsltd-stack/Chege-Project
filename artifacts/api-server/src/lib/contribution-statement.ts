import { nairobiNow } from "./nairobiTime";
/**
 * The entry-level contribution statement: shared types plus the pure helpers
 * for narrowing a statement to an explicit day range. The database load lives
 * in routes/contributors.ts; keeping these here lets the day-range download be
 * tested without a database.
 */

export interface StatementEntry {
  contributorId: number;
  contributorName: string;
  /** YYYY-MM-DD. For a manual month/year contribution this is the first of
   *  that month; a bank deposit carries its real date. */
  date: string;
  amount: number;
  source: "recorded" | "deposit";
  description: string | null;
  /** The bank account a deposit landed in, by name. Null for a hand-recorded
   *  contribution (there is no account) or a deposit whose account was
   *  removed. */
  bankName: string | null;
}

/**
 * Money that reached the group's bank without belonging to anybody.
 *
 * A deposit with no contributor split is Shared group funding, not anyone's
 * contribution, and the ledger deliberately leaves it out — crediting it to a
 * member would overstate what they gave. But leaving it out silently is what
 * made a report read nil in one place and show figures in another, with
 * nothing to connect them. It is reported here so the two reconcile on the
 * page without becoming anybody's contribution.
 *
 * A deposit split across contributors for only part of its value leaves the
 * remainder here, so partial attribution is not quietly lost either.
 */
export interface GroupFundingEntry {
  transactionId: number;
  date: string;
  description: string | null;
  /** The part of the deposit no contributor claimed. */
  amount: number;
  bankName: string | null;
}

export interface ContributionStatement {
  periodLabel: string;
  contributors: Array<{ id: number; name: string; userId: string | null; monthlyTarget: number | null }>;
  /** Oldest first, so a running total reads top to bottom. */
  entries: StatementEntry[];
  totalsByContributor: Record<number, number>;
  grandTotal: number;
  /** Not part of grandTotal: it is nobody's contribution. */
  groupFunding: GroupFundingEntry[];
  groupFundingTotal: number;
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "3 Sep 2026" — the day form used to label a date-range statement. Built
 *  from a fixed table, not Intl, so the abbreviation ("Sep", never "Sept")
 *  is the same on every Node/ICU build. */
export function formatStatementDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const abbr = MONTH_ABBR[(month ?? 1) - 1] ?? "";
  return `${day ?? 1} ${abbr} ${year}`;
}

/**
 * Narrow a statement to an explicit `[from, to]` day range and re-label it.
 * Bank deposits sit on their real date; a hand-recorded month/year entry sits
 * on the first of its month, so a range that starts mid-month still includes
 * that month's recorded contributions only when it covers the 1st.
 */
export function filterStatementToRange(
  statement: ContributionStatement,
  range: { from: string; to: string },
): ContributionStatement {
  const [from, to] = range.from <= range.to ? [range.from, range.to] : [range.to, range.from];
  const entries = statement.entries.filter((entry) => entry.date >= from && entry.date <= to);
  const totalsByContributor: Record<number, number> = {};
  for (const entry of entries) {
    totalsByContributor[entry.contributorId] = (totalsByContributor[entry.contributorId] ?? 0) + entry.amount;
  }
  // Narrowed by the same window, or a range would show group funding from
  // outside the period it claims to cover.
  const groupFunding = statement.groupFunding.filter((entry) => entry.date >= from && entry.date <= to);
  return {
    periodLabel: `${formatStatementDate(from)} – ${formatStatementDate(to)}`,
    contributors: statement.contributors,
    entries,
    totalsByContributor,
    grandTotal: entries.reduce((sum, entry) => sum + entry.amount, 0),
    groupFunding,
    groupFundingTotal: groupFunding.reduce((sum, entry) => sum + entry.amount, 0),
  };
}

/** Months back from now that a `from` date sits in, so a fetch window covers
 *  it. The caller caps this to the 12 the grid supports. */
export function monthsToCover(fromIso: string): number {
  const [year, month] = fromIso.split("-").map(Number);
  const now = nairobiNow();
  return (now.getUTCFullYear() - (year ?? now.getUTCFullYear())) * 12 + (now.getUTCMonth() + 1 - (month ?? 1)) + 1;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * A monthly target, prorated across an exact `[from, to]` day range.
 *
 * Each calendar month the range touches contributes `target * (days of that
 * month inside the range / days in that month)` — a month the range only
 * partly covers (the first and last, usually) counts for its own share, not
 * a whole month. February and a 31-day month are not treated alike.
 *
 * This is deliberately the only side of "expected vs actual" that gets this
 * precision: `given` still comes from filterStatementToRange, which keeps a
 * hand-recorded contribution pinned to the first of its month (there is no
 * day to prorate it by — see StatementEntry.date). A day-range "expected"
 * compared against a month-granular "given" is still more useful mid-month
 * than only ever being able to ask about whole months.
 */
/** One dated change to what a contributor is expected to give. */
export type DatedTarget = { amount: number | null; effectiveFrom: string };

/**
 * What was expected of somebody on a given day: the latest dated amount that
 * had come into force by then, or `legacy` — the old undated
 * `group_contributors.monthly_target` — for any day before the first one.
 *
 * That fallback is what let dated targets ship without a backfill: a group
 * that has never set one still measures every month against the figure it
 * always had.
 */
export function targetOn(day: string, dated: readonly DatedTarget[], legacy: number | null): number | null {
  let inForce: DatedTarget | null = null;
  for (const row of dated) {
    if (row.effectiveFrom > day) continue;
    if (!inForce || row.effectiveFrom > inForce.effectiveFrom) inForce = row;
  }
  return inForce ? inForce.amount : legacy;
}

/**
 * `prorateExpected` over a history of dated amounts rather than one fixed
 * figure — each day counts at whatever was expected *that* day, so raising
 * someone's amount today leaves every month before it measured against what
 * they actually owed then.
 *
 * A month's share is still its own length: a day in February is worth more of
 * a monthly amount than a day in March.
 */
export function prorateExpectedDated(
  from: string,
  to: string,
  dated: readonly DatedTarget[],
  legacy: number | null,
): number {
  const [start, end] = from <= to ? [from, to] : [to, from];
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  if (!startYear || !startMonth || !startDay || !endYear || !endMonth || !endDay) return 0;

  let total = 0;
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const monthLength = daysInMonth(year, month);
    const firstDay = year === startYear && month === startMonth ? startDay : 1;
    const lastDay = year === endYear && month === endMonth ? endDay : monthLength;
    for (let day = firstDay; day <= lastDay; day += 1) {
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const amount = targetOn(iso, dated, legacy);
      if (amount) total += amount / monthLength;
    }
    if (month === 12) { month = 1; year += 1; } else { month += 1; }
  }
  return Math.round(total);
}

export function prorateExpected(monthlyTarget: number, from: string, to: string): number {
  const [start, end] = from <= to ? [from, to] : [to, from];
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  if (!startYear || !startMonth || !startDay || !endYear || !endMonth || !endDay) return 0;

  let total = 0;
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const monthLength = daysInMonth(year, month);
    const isFirst = year === startYear && month === startMonth;
    const isLast = year === endYear && month === endMonth;
    const firstDay = isFirst ? startDay : 1;
    const lastDay = isLast ? endDay : monthLength;
    const coveredDays = Math.max(0, lastDay - firstDay + 1);
    total += monthlyTarget * (coveredDays / monthLength);

    if (month === 12) { month = 1; year += 1; } else { month += 1; }
  }
  return Math.round(total);
}
