import { sql, type AnyColumn, type SQL } from "drizzle-orm";

/**
 * "This month" as a range of days the database can look up.
 *
 * Month filters were written EXTRACT(MONTH FROM date) = m AND EXTRACT(YEAR FROM
 * date) = y. The (group_id, date) indexes cannot answer that, so every one read
 * the budget's whole history to find one month - Home's summary and activity
 * among them, slower with every month imported (lag audit, 7 Oct 2026).
 * date >= first day AND date < first day of the next month picks the same rows
 * and uses the index. It works the same for a timestamp column.
 */
export function monthBounds(year: number, month: number): { from: string; to: string } | null {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12 || y < 1 || y > 9999) return null;
  const day = (yy: number, mm: number) => `${String(yy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-01`;
  return { from: day(y, m), to: m === 12 ? day(y + 1, 1) : day(y, m + 1) };
}

/** Rows of `column` in that month; none for a month that does not exist, as EXTRACT gave. */
export function inMonthOf(column: AnyColumn | SQL, year: number, month: number): SQL {
  const bounds = monthBounds(year, month);
  if (!bounds) return sql`FALSE`;
  return sql`(${column} >= ${bounds.from}::date AND ${column} < ${bounds.to}::date)`;
}

/** Rows of `column` in that year. */
export function inYearOf(column: AnyColumn | SQL, year: number): SQL {
  const from = monthBounds(year, 1);
  if (!from) return sql`FALSE`;
  return sql`(${column} >= ${from.from}::date AND ${column} < ${`${String(Number(year) + 1).padStart(4, "0")}-01-01`}::date)`;
}
