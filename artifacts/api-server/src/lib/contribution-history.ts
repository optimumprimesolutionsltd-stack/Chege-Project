/**
 * Turning contribution rows into a member-by-month grid.
 *
 * Kept separate from the query so the arithmetic can be tested without a
 * database. It is small, but it is the part that can be quietly wrong: a
 * contribution landing in the wrong column, or a member who has paid nothing
 * disappearing from a report whose whole purpose is to show exactly that.
 */

export interface HistoryMonth {
  month: number;
  year: number;
  label: string;
}

export interface ContributionRow {
  userId: string;
  firstName: string | null;
  amount: number | string;
  month: number;
  year: number;
}

export interface ExpenseRow {
  total: number | string;
  month: number | string;
  year: number | string;
}

export interface MembershipRow {
  userId: string;
  firstName: string | null;
}

export interface ContributionHistory {
  months: HistoryMonth[];
  members: Array<{ userId: string; name: string; amounts: number[]; total: number }>;
  contributionTotals: number[];
  expenseTotals: number[];
}

/** The months to report on, oldest first, ending with the one containing `now`. */
export function historyMonths(monthsBack: number, now: Date = new Date()): HistoryMonth[] {
  return Array.from({ length: monthsBack }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - index), 1);
    return {
      month: date.getMonth() + 1,
      year: date.getFullYear(),
      label: date.toLocaleString("en-KE", { month: "short", year: "numeric" }),
    };
  });
}

export function buildContributionHistory(input: {
  months: HistoryMonth[];
  contributions: ContributionRow[];
  expenses: ExpenseRow[];
  memberships: MembershipRow[];
}): ContributionHistory {
  const { months, contributions, expenses, memberships } = input;
  const columnFor = new Map(months.map((entry, index) => [`${entry.year}-${entry.month}`, index]));
  const blank = () => months.map(() => 0);

  // Seeded from the membership list rather than from the contributions, so a
  // member who has paid nothing still appears. A row of dashes is the entire
  // reason somebody opens this.
  const rows = new Map<string, { userId: string; name: string; amounts: number[] }>();
  for (const member of memberships) {
    rows.set(member.userId, { userId: member.userId, name: member.firstName ?? "Member", amounts: blank() });
  }

  for (const entry of contributions) {
    const column = columnFor.get(`${entry.year}-${entry.month}`);
    if (column === undefined) continue;
    // Somebody who has since left still contributed what they contributed.
    // Dropping them would make the column totals disagree with the rows above.
    const row = rows.get(entry.userId) ?? {
      userId: entry.userId,
      name: entry.firstName ?? "Former member",
      amounts: blank(),
    };
    row.amounts[column] += Number(entry.amount) || 0;
    rows.set(entry.userId, row);
  }

  const expenseTotals = blank();
  for (const entry of expenses) {
    const column = columnFor.get(`${Number(entry.year)}-${Number(entry.month)}`);
    if (column === undefined) continue;
    expenseTotals[column] += Number(entry.total) || 0;
  }

  const members = [...rows.values()]
    .map((row) => ({ ...row, total: row.amounts.reduce((sum, amount) => sum + amount, 0) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return {
    months,
    members,
    contributionTotals: months.map((_, column) =>
      members.reduce((sum, member) => sum + member.amounts[column], 0),
    ),
    expenseTotals,
  };
}
