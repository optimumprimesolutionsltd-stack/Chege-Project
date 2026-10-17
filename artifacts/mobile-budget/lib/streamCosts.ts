/**
 * What a business cost over a period, one entry at a time (api-server
 * dashboard incomeStreamCostEntries), grouped by category for All income:
 * "side hustle income ... where did the loss come from, can i edit incase
 * there were wrong entries" (17 Oct 2026).
 */
export type CostEntry = {
  incomeSourceId: number;
  category: string;
  date: string;
  description: string;
  amount: number;
  /** An expense's id, or an M-Pesa or bank entry's, to open it. */
  id: number;
  source: 'expense' | 'bank';
  accountId?: number | null;
};

export type CostLine = { category: string; total: number; entries: CostEntry[] };

const cents = (value: number) => Math.round(value * 100) / 100;

/** One stream's costs by category, the biggest first, each newest first. */
export function costsByCategory(entries: readonly CostEntry[], incomeSourceId: number | null): CostLine[] {
  if (incomeSourceId == null) return [];
  const lines = new Map<string, CostLine>();
  for (const entry of entries) {
    if (entry.incomeSourceId !== incomeSourceId) continue;
    const line = lines.get(entry.category) ?? { category: entry.category, total: 0, entries: [] };
    line.total = cents(line.total + entry.amount);
    line.entries.push(entry);
    lines.set(entry.category, line);
  }
  return [...lines.values()]
    .map((line) => ({ ...line, entries: [...line.entries].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id) }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
}
