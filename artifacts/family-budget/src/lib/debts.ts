/**
 * A debt is a budget category with a balance tracked on it — no separate
 * ledger. `debtBalance` is null for a plain spending category and a number
 * (possibly 0, once paid off) for a tracked debt.
 */
export interface DebtCategory {
  id: number;
  name: string;
  debtBalance: number | null;
  debtInterestRateBps: number | null;
}

export type PayoffStrategy = "snowball" | "avalanche";

/** Only categories actually tracked as a debt, in the order a payoff plan
 *  should attack them. Snowball: smallest balance first, for the quick win
 *  that keeps a plan going past the first month. Avalanche: highest interest
 *  rate first, for the smallest total cost. Both beat no plan; neither is
 *  wrong. Ties keep whatever order they arrived in. */
export function rankDebtsForPayoff(categories: readonly DebtCategory[], strategy: PayoffStrategy): DebtCategory[] {
  const debts = categories.filter((category): category is DebtCategory & { debtBalance: number } => category.debtBalance !== null);
  const ranked = [...debts];
  if (strategy === "snowball") {
    ranked.sort((a, b) => a.debtBalance - b.debtBalance);
  } else {
    ranked.sort((a, b) => (b.debtInterestRateBps ?? 0) - (a.debtInterestRateBps ?? 0));
  }
  return ranked;
}

export function formatInterestRate(bps: number | null): string {
  if (bps === null) return "No rate set";
  return `${(bps / 100).toLocaleString("en-KE", { maximumFractionDigits: 2 })}% per year`;
}
