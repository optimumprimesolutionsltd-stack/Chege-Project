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

const cents = (value: number) => Math.round(value * 100) / 100;

export function buildBusinessReport(input: {
  from: string;
  to: string;
  /** What each stream brought in over the period (All income's "received"). */
  salesByStream: Map<number, number>;
  costLines: BusinessCostRow[];
  /** Every stream with a category linked to it, spent on this period or not. */
  linkedStreamIds: number[];
  /** Streams the group owns. A linked id not here is somebody else's, and left out. */
  streamNames: Map<number, string>;
}) {
  const ids = [...new Set([...input.linkedStreamIds, ...input.costLines.map((line) => line.incomeSourceId)])]
    .filter((id) => input.streamNames.has(id));

  const businesses = ids.map((id) => {
    const lines = input.costLines.filter((line) => line.incomeSourceId === id && Math.abs(line.amount) >= 0.005);
    const kind = (costKind: BusinessCostRow["costKind"]) => lines
      .filter((line) => line.costKind === costKind)
      .map((line) => ({ category: line.category, amount: cents(line.amount) }))
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
