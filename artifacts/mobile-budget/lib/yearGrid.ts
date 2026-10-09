/**
 * The year at a glance: every income stream and every spending category, a
 * column a month - "all incomes and expenses in one page to compare which
 * months did what" (9 Oct 2026), the whole year by default.
 *
 * Built from the reports each month already has (category breakdown, income
 * streams), so a cell says exactly what Reports says for that month. Amounts
 * sit on subcategories; a heading's row only adds up the rows under it. A
 * business's costs are its own section, never money out, as in Reports. The
 * month in progress is shown "so far" and never marked as a year's highest.
 */

export type BreakdownRow = {
  category: string;
  spentAmount: number;
  parentName?: string | null;
  isBusinessCost?: boolean;
};
export type IncomeMonth = { streams: Array<{ incomeSourceId?: number | null; sourceName: string; total: number }> };

export type GridMonth = { year: number; month: number; label: string; soFar: boolean };
export type GridRow = {
  name: string;
  amounts: number[];
  total: number;
  /** The column of the highest complete month, when one stands out (-1 otherwise). */
  peak: number;
  /** Rows under a heading; empty for a plain category or stream. */
  children: GridRow[];
};
export type YearGrid = {
  months: GridMonth[];
  income: GridRow[];
  spending: GridRow[];
  businessCosts: GridRow[];
  moneyIn: number[];
  moneyOut: number[];
  leftOver: number[];
};

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** January to December of `year`, cut at the month in progress for the current year. */
export function yearMonths(year: number, today: { year: number; month: number }): GridMonth[] {
  if (year > today.year) return [];
  const last = year === today.year ? today.month : 12;
  return Array.from({ length: last }, (_, index) => ({
    year,
    month: index + 1,
    label: SHORT[index],
    soFar: year === today.year && index + 1 === today.month,
  }));
}

const round = (value: number) => Math.round(Number(value) || 0);
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

function rowOf(name: string, amounts: number[], months: readonly GridMonth[], children: GridRow[] = []): GridRow {
  // Only complete months compete, and only when the row has more than one to compare.
  const complete = amounts.map((amount, index) => ({ amount, index })).filter(({ index }) => !months[index]?.soFar);
  const best = complete.reduce<{ amount: number; index: number } | null>((top, cell) => (cell.amount > (top?.amount ?? 0) ? cell : top), null);
  const others = complete.filter((cell) => cell.amount > 0).length;
  return { name, amounts, total: sum(amounts), peak: best && others > 1 ? best.index : -1, children };
}

const byTotal = (a: GridRow, b: GridRow) => b.total - a.total || a.name.localeCompare(b.name);
const addUp = (rows: readonly GridRow[], length: number) =>
  Array.from({ length }, (_, index) => sum(rows.map((row) => row.amounts[index] ?? 0)));

/**
 * Spending rows from each month's breakdown: the subcategories under their
 * heading, a category with nothing under it on its own. A heading's amount
 * from the server already holds every subcategory's (a business's cost under
 * it included), so only what is left over is its own - filed on the heading
 * before amounts moved to subcategories - and shows as its own line.
 */
function spendingRows(perMonth: ReadonlyArray<readonly BreakdownRow[]>, months: readonly GridMonth[], business: boolean): GridRow[] {
  const length = months.length;
  const isParent = new Set<string>();
  perMonth.forEach((rows) => rows.forEach((row) => { if (row.parentName) isParent.add(row.parentName); }));
  // What each heading's subcategories spent each month, both sides.
  const underHeading = new Map<string, number[]>();
  const cells = new Map<string, { parent: string | null; business: boolean; amounts: number[] }>();
  perMonth.forEach((rows, index) => {
    for (const row of rows) {
      const amount = round(row.spentAmount);
      const entry = cells.get(row.category) ?? { parent: row.parentName ?? null, business: row.isBusinessCost ?? false, amounts: Array<number>(length).fill(0) };
      entry.amounts[index] += amount;
      cells.set(row.category, entry);
      if (row.parentName && !isParent.has(row.category)) {
        const totals = underHeading.get(row.parentName) ?? Array<number>(length).fill(0);
        totals[index] += amount;
        underHeading.set(row.parentName, totals);
      }
    }
  });
  const headings = new Map<string, GridRow[]>();
  const plain: GridRow[] = [];
  for (const [name, entry] of cells) {
    if (entry.business !== business) continue;
    if (isParent.has(name)) {
      const children = underHeading.get(name) ?? Array<number>(length).fill(0);
      const left = entry.amounts.map((amount, index) => Math.max(0, amount - children[index]));
      if (sum(left) > 0) headings.set(name, [...(headings.get(name) ?? []), rowOf(`${name} (not in a subcategory)`, left, months)]);
      continue;
    }
    const row = rowOf(name, entry.amounts, months);
    if (entry.parent) headings.set(entry.parent, [...(headings.get(entry.parent) ?? []), row]);
    else plain.push(row);
  }
  const grouped = [...headings.entries()]
    .map(([name, children]) => rowOf(name, addUp(children, length), months, children.filter((child) => child.total > 0).sort(byTotal)))
    .filter((row) => row.total > 0);
  return [...grouped, ...plain.filter((row) => row.total > 0)].sort(byTotal);
}

function incomeRows(perMonth: ReadonlyArray<IncomeMonth | undefined>, months: readonly GridMonth[]): GridRow[] {
  const cells = new Map<string, number[]>();
  perMonth.forEach((report, index) => {
    for (const stream of report?.streams ?? []) {
      const amounts = cells.get(stream.sourceName) ?? Array<number>(months.length).fill(0);
      amounts[index] += round(stream.total);
      cells.set(stream.sourceName, amounts);
    }
  });
  return [...cells.entries()].map(([name, amounts]) => rowOf(name, amounts, months)).filter((row) => row.total !== 0).sort(byTotal);
}

/** The whole grid, one column a month, from each month's reports in the same order as `months`. */
export function yearGrid(
  months: readonly GridMonth[],
  breakdowns: ReadonlyArray<readonly BreakdownRow[] | undefined>,
  income: ReadonlyArray<IncomeMonth | undefined>,
): YearGrid {
  const perMonth = months.map((_, index) => breakdowns[index] ?? []);
  const spending = spendingRows(perMonth, months, false);
  const businessCosts = spendingRows(perMonth, months, true);
  const incomeList = incomeRows(months.map((_, index) => income[index]), months);
  const moneyIn = addUp(incomeList, months.length);
  const moneyOut = addUp(spending, months.length);
  return {
    months: [...months],
    income: incomeList,
    spending,
    businessCosts,
    moneyIn,
    moneyOut,
    leftOver: moneyIn.map((amount, index) => amount - moneyOut[index]),
  };
}

/** A cell, short enough for a column: 12,400 / 1.2M. */
export function cellText(amount: number): string {
  if (amount === 0) return '–';
  const value = Math.abs(amount);
  const sign = amount < 0 ? '−' : '';
  if (value >= 1_000_000) return `${sign}${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  return `${sign}${value.toLocaleString('en-KE')}`;
}
