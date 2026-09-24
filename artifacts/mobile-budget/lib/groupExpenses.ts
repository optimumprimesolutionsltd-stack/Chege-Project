export type LedgerEntry = {
  id: string;
  date: string;
  description: string;
  amount: number;
  /** One name, or several when the expense was split across categories */
  categories: string[];
};

export type ExpenseGroup<T extends LedgerEntry> = {
  key: string;
  label: string;
  total: number;
  count: number;
  rows: T[];
};

/** Where an expense split across categories is filed: its amounts are not per category. */
export const SPLIT_LABEL = 'Split across categories';

const round2 = (value: number) => Math.round(value * 100) / 100;

/** "  Milk  " and "milk" are one thing. */
const itemKey = (description: string) => description.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-KE');

function collect<T extends LedgerEntry>(
  entries: readonly T[],
  keyOf: (entry: T) => { key: string; label: string },
): ExpenseGroup<T>[] {
  const groups = new Map<string, ExpenseGroup<T>>();
  // Entries arrive newest first, so the first label seen for a key is the
  // latest spelling of it.
  for (const entry of entries) {
    const { key, label } = keyOf(entry);
    const group = groups.get(key) ?? { key, label, total: 0, count: 0, rows: [] };
    group.total += entry.amount;
    group.count += 1;
    group.rows.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, total: round2(group.total) }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

/**
 * The ledger's entries filed under their category, biggest first.
 *
 * An expense split across categories carries no amount per category, so
 * guessing a share for each would make the totals lie. It sits in its own
 * group instead, and every group total is a real sum of whole expenses.
 */
export function groupByCategory<T extends LedgerEntry>(entries: readonly T[]): ExpenseGroup<T>[] {
  return collect(entries, (entry) => {
    const names = entry.categories.filter((name) => name.trim() !== '');
    if (names.length === 1) return { key: `c:${names[0].toLocaleLowerCase('en-KE')}`, label: names[0] };
    if (names.length > 1) return { key: 'split', label: SPLIT_LABEL };
    return { key: 'none', label: 'Uncategorised' };
  });
}

/** The ledger's entries filed under what was bought, biggest first. */
export function groupByItem<T extends LedgerEntry>(entries: readonly T[]): ExpenseGroup<T>[] {
  return collect(entries, (entry) => {
    const key = itemKey(entry.description);
    return { key: `i:${key}`, label: entry.description.trim() || 'No description' };
  });
}
