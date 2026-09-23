/**
 * Turning per-month income-stream funding rows into a stream-by-month grid.
 *
 * Kept separate from the query for the same reason contribution-history.ts
 * is: the arithmetic can be tested without a database, and a stream that
 * funded nothing in a given month has to show as 0 in that column rather
 * than vanish from it — a stream missing a column is indistinguishable from
 * one that was never asked about.
 */

import type { HistoryMonth } from "./contribution-history";

export interface IncomeStreamTrendRow {
  incomeSourceId: number | null;
  sourceName: string;
  amount: number | string;
  month: number | string;
  year: number | string;
}

export interface IncomeSourceSeed {
  id: number;
  name: string;
}

export interface IncomeStreamTrendSeries {
  incomeSourceId: number | null;
  sourceName: string;
  amounts: number[];
  total: number;
}

export interface IncomeStreamTrend {
  months: HistoryMonth[];
  streams: IncomeStreamTrendSeries[];
}

export function buildIncomeStreamTrend(input: {
  months: HistoryMonth[];
  rows: IncomeStreamTrendRow[];
  sources: IncomeSourceSeed[];
}): IncomeStreamTrend {
  const { months, rows, sources } = input;
  const columnFor = new Map(months.map((entry, index) => [`${entry.year}-${entry.month}`, index]));
  const blank = () => months.map(() => 0);

  // Seeded from every income source, not from the rows, so a stream that
  // funded nothing across the whole range still appears — a row of zeros is
  // itself the answer to "how has this stream been doing".
  const streams = new Map<number, IncomeStreamTrendSeries>();
  for (const source of sources) {
    streams.set(source.id, { incomeSourceId: source.id, sourceName: source.name, amounts: blank(), total: 0 });
  }

  let unattributed: IncomeStreamTrendSeries | null = null;
  for (const row of rows) {
    const column = columnFor.get(`${Number(row.year)}-${Number(row.month)}`);
    if (column === undefined) continue;
    const amount = Number(row.amount) || 0;
    if (row.incomeSourceId === null) {
      unattributed ??= { incomeSourceId: null, sourceName: "Unattributed", amounts: blank(), total: 0 };
      unattributed.amounts[column] += amount;
      unattributed.total += amount;
      continue;
    }
    // A source deleted after it funded something still funded it — kept
    // under its recorded name rather than dropped, the same reason a former
    // member's contributions stay in buildContributionHistory.
    const series = streams.get(row.incomeSourceId) ?? {
      incomeSourceId: row.incomeSourceId,
      sourceName: row.sourceName,
      amounts: blank(),
      total: 0,
    };
    series.amounts[column] += amount;
    series.total += amount;
    streams.set(row.incomeSourceId, series);
  }

  const ordered = [...streams.values()];
  if (unattributed) ordered.push(unattributed);
  ordered.sort((a, b) => b.total - a.total || a.sourceName.localeCompare(b.sourceName));

  return { months, streams: ordered };
}
