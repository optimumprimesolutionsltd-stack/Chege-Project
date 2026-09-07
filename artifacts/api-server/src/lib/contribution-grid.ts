/**
 * Who has paid, month by month.
 *
 * The sheet every collecting group already keeps: names down the side, months
 * across the top. The only question it answers is whether each person has done
 * this month, which is why there is no date here - a group asks "has Mary
 * done March", never "which day in March".
 *
 * Kept pure so the arithmetic can be tested without a database. It is small,
 * but it is the part that can be quietly wrong: a contribution landing in the
 * wrong column, or somebody who has paid nothing vanishing from a report whose
 * entire purpose is to show exactly that.
 */

export interface GridMonth {
  month: number;
  year: number;
  label: string;
}

export interface GridContributor {
  id: number;
  name: string;
  /** What this person is expected to give per month, or null where giving is
   *  voluntary - a church rather than a chama. Null means nothing is owed and
   *  nothing is outstanding, which is a different thing from owing zero. */
  monthlyTarget: number | null;
  archivedAt?: Date | string | null;
}

/** One recorded contribution, from either place money is recorded. */
export interface GridEntry {
  contributorId: number | null;
  amount: number | string;
  month: number;
  year: number;
}

export interface GridRow {
  contributorId: number;
  name: string;
  monthlyTarget: number | null;
  amounts: number[];
  total: number;
  /** How much of the expected amount is still missing, per month. Null where
   *  there is no expectation - a church is never chasing anybody. */
  outstanding: Array<number | null>;
}

export interface ContributionGrid {
  months: GridMonth[];
  rows: GridRow[];
  columnTotals: number[];
  grandTotal: number;
}

export function gridMonths(monthsBack: number, now: Date = new Date()): GridMonth[] {
  return Array.from({ length: monthsBack }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - index), 1);
    return {
      month: date.getMonth() + 1,
      year: date.getFullYear(),
      label: date.toLocaleString("en-KE", { month: "short", year: "numeric" }),
    };
  });
}

export function buildContributionGrid(input: {
  months: GridMonth[];
  contributors: GridContributor[];
  entries: GridEntry[];
}): ContributionGrid {
  const { months, contributors, entries } = input;
  const columnFor = new Map(months.map((entry, index) => [`${entry.year}-${entry.month}`, index]));
  const blank = () => months.map(() => 0);

  // Seeded from the contributor list, not from what has been paid. A row of
  // dashes is the entire reason somebody opens this: it is how the treasurer
  // sees who has not paid.
  const rows = new Map<number, GridRow>();
  for (const contributor of contributors) {
    if (contributor.archivedAt) continue;
    rows.set(contributor.id, {
      contributorId: contributor.id,
      name: contributor.name,
      monthlyTarget: contributor.monthlyTarget,
      amounts: blank(),
      total: 0,
      outstanding: months.map(() => null),
    });
  }

  for (const entry of entries) {
    if (entry.contributorId === null) continue;
    const column = columnFor.get(`${entry.year}-${entry.month}`);
    if (column === undefined) continue;
    const row = rows.get(entry.contributorId);
    // An entry against an archived or unknown contributor is skipped rather
    // than resurrecting them into the grid. Their money is still in the
    // account; it is the row that has been retired.
    if (!row) continue;
    row.amounts[column] += Number(entry.amount) || 0;
  }

  for (const row of rows.values()) {
    row.total = row.amounts.reduce((sum, amount) => sum + amount, 0);
    row.outstanding = row.amounts.map((paid) => {
      if (row.monthlyTarget === null) return null;
      const short = row.monthlyTarget - paid;
      // Somebody who gave more than expected is not owed anything back, and
      // showing a negative outstanding reads as an error.
      return short > 0 ? short : 0;
    });
  }

  const ordered = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));

  return {
    months,
    rows: ordered,
    columnTotals: months.map((_, column) =>
      ordered.reduce((sum, row) => sum + row.amounts[column], 0),
    ),
    grandTotal: ordered.reduce((sum, row) => sum + row.total, 0),
  };
}
