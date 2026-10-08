/**
 * A profit and loss statement for each side hustle.
 *
 * A side hustle is an income stream with at least one category linked to it as
 * a cost (Reports' Cost categories picker). Its statement reads the way any
 * business's does:
 *
 *   Sales                   what it brought in - the same figure as All income
 *   - Cost of goods sold    what the things sold cost (stock, fuel)
 *   = Gross profit
 *   - Expenses              the cost of running it (repairs, a stall's rent)
 *   = Net profit
 *
 * Every figure comes from queries the rest of the app already uses, so the
 * statement agrees with All income and the income-streams report: its net
 * profit is the same number All income shows as that stream's profit.
 */

export type BusinessCostRow = {
  incomeSourceId: number;
  category: string;
  costKind: "cogs" | "expense";
  amount: number;
};

/** One entry behind a cost line, for the statement's details. */
export type BusinessCostEntryRow = { incomeSourceId: number; category: string; date: string; description: string; amount: number };
type Entry = { date: string; description: string; amount: number };

const cents = (value: number) => Math.round(value * 100) / 100;
/** Details list at most this many entries per line, newest first, with the count of the rest. */
const DETAIL_ENTRIES = 25;
const newestFirst = (a: Entry, b: Entry) => b.date.localeCompare(a.date);

/** The five figures of a statement, from sales and cost lines. */
function figures(sales: number, lines: BusinessCostRow[]) {
  const cogs = cents(lines.filter((line) => line.costKind === "cogs").reduce((sum, line) => sum + line.amount, 0));
  const expenses = cents(lines.filter((line) => line.costKind === "expense").reduce((sum, line) => sum + line.amount, 0));
  const grossProfit = cents(sales - cogs);
  return { sales: cents(sales), costOfGoodsSold: cogs, grossProfit, expenses, netProfit: cents(grossProfit - expenses) };
}

export function buildBusinessReport(input: {
  from: string;
  to: string;
  /** What each stream brought in over the period (All income's "received"). */
  salesByStream: Map<number, number>;
  costLines: BusinessCostRow[];
  /**
   * The businesses reported on: My businesses whose profit is counted, costs
   * this period or not. Nothing else is a business - an income stream with
   * costs linked to it included (lib/business-streams).
   */
  linkedStreamIds: number[];
  /** Streams the group owns. A linked id not here is somebody else's, and left out. */
  streamNames: Map<number, string>;
  /** Asked for on "Show details": the entries behind each figure, and the period before to compare. */
  detail?: {
    salesEntries: Array<Entry & { incomeSourceId: number }>;
    costEntries: BusinessCostEntryRow[];
    previous: { from: string; to: string; salesByStream: Map<number, number>; costLines: BusinessCostRow[] };
  };
}) {
  const ids = [...new Set(input.linkedStreamIds)].filter((id) => input.streamNames.has(id));

  const businesses = ids.map((id) => {
    const lines = input.costLines.filter((line) => line.incomeSourceId === id && Math.abs(line.amount) >= 0.005);
    const salesTotal = input.salesByStream.get(id) ?? 0;
    const entriesFor = (category: string) => {
      const all = (input.detail?.costEntries ?? [])
        .filter((entry) => entry.incomeSourceId === id && entry.category === category)
        .map((entry) => ({ date: entry.date, description: entry.description, amount: cents(entry.amount) }))
        .sort(newestFirst);
      return { entries: all.slice(0, DETAIL_ENTRIES), more: Math.max(0, all.length - DETAIL_ENTRIES) };
    };
    const kind = (costKind: BusinessCostRow["costKind"]) => lines
      .filter((line) => line.costKind === costKind)
      .map((line) => ({
        category: line.category,
        amount: cents(line.amount),
        ...(input.detail ? {
          shareOfSales: salesTotal > 0 ? Math.round((line.amount / salesTotal) * 1000) / 10 : null,
          ...entriesFor(line.category),
        } : {}),
      }))
      .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
    const costOfGoodsSoldLines = kind("cogs");
    const expenseLines = kind("expense");
    const sales = cents(input.salesByStream.get(id) ?? 0);
    const costOfGoodsSold = cents(costOfGoodsSoldLines.reduce((sum, line) => sum + line.amount, 0));
    const expenses = cents(expenseLines.reduce((sum, line) => sum + line.amount, 0));
    const grossProfit = cents(sales - costOfGoodsSold);
    return {
      incomeSourceId: id,
      name: input.streamNames.get(id)!,
      sales,
      costOfGoodsSold,
      grossProfit,
      expenses,
      netProfit: cents(grossProfit - expenses),
      costOfGoodsSoldLines,
      expenseLines,
      ...(input.detail ? (() => {
        const sales = input.detail.salesEntries
          .filter((entry) => entry.incomeSourceId === id)
          .map((entry) => ({ date: entry.date, description: entry.description, amount: cents(entry.amount) }))
          .sort(newestFirst);
        const previousLines = input.detail.previous.costLines.filter((line) => line.incomeSourceId === id);
        return {
          salesEntries: sales.slice(0, DETAIL_ENTRIES),
          moreSalesEntries: Math.max(0, sales.length - DETAIL_ENTRIES),
          previous: {
            from: input.detail.previous.from,
            to: input.detail.previous.to,
            ...figures(input.detail.previous.salesByStream.get(id) ?? 0, previousLines),
          },
        };
      })() : {}),
    };
  }).sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));

  const sum = (pick: (business: (typeof businesses)[number]) => number) =>
    cents(businesses.reduce((total, business) => total + pick(business), 0));

  return {
    from: input.from,
    to: input.to,
    businesses,
    totals: {
      sales: sum((business) => business.sales),
      costOfGoodsSold: sum((business) => business.costOfGoodsSold),
      grossProfit: sum((business) => business.grossProfit),
      expenses: sum((business) => business.expenses),
      netProfit: sum((business) => business.netProfit),
    },
  };
}
