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

export interface ContributionStatement {
  periodLabel: string;
  contributors: Array<{ id: number; name: string; userId: string | null }>;
  /** Oldest first, so a running total reads top to bottom. */
  entries: StatementEntry[];
  totalsByContributor: Record<number, number>;
  grandTotal: number;
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
  return {
    periodLabel: `${formatStatementDate(from)} – ${formatStatementDate(to)}`,
    contributors: statement.contributors,
    entries,
    totalsByContributor,
    grandTotal: entries.reduce((sum, entry) => sum + entry.amount, 0),
  };
}

/** Months back from now that a `from` date sits in, so a fetch window covers
 *  it. The caller caps this to the 12 the grid supports. */
export function monthsToCover(fromIso: string): number {
  const [year, month] = fromIso.split("-").map(Number);
  const now = new Date();
  return (now.getFullYear() - (year ?? now.getFullYear())) * 12 + (now.getMonth() + 1 - (month ?? 1)) + 1;
}
