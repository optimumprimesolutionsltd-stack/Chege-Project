export type GroupableExpense = {
  id: number;
  amount: number;
  category: string;
  description: string;
  categoryAllocations?: { category: string; amount: number }[];
};

export type ExpenseGroup<T extends GroupableExpense> = {
  key: string;
  label: string;
  total: number;
  count: number;
  rows: T[];
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const UNCATEGORISED = "Uncategorized";

function finish<T extends GroupableExpense>(groups: Map<string, ExpenseGroup<T>>): ExpenseGroup<T>[] {
  return [...groups.values()]
    .map((group) => ({ ...group, total: round2(group.total) }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

/**
 * Expenses filed under their category, biggest first.
 *
 * Unlike the phone's ledger, the web has the amount of every portion, so an
 * expense split across categories adds its own share to each one and appears
 * under each. Totals are therefore exact, and add up to the spending in the
 * list (an expense shown under two categories is counted once per share).
 */
export function groupExpensesByCategory<T extends GroupableExpense>(expenses: readonly T[]): ExpenseGroup<T>[] {
  const groups = new Map<string, ExpenseGroup<T>>();
  for (const expense of expenses) {
    const portions = expense.categoryAllocations && expense.categoryAllocations.length > 0
      ? expense.categoryAllocations
      : [{ category: expense.category, amount: expense.amount }];
    for (const portion of portions) {
      const label = portion.category?.trim() || UNCATEGORIZED_LABEL;
      const key = `c:${label.toLocaleLowerCase("en-KE")}`;
      const group = groups.get(key) ?? { key, label, total: 0, count: 0, rows: [] };
      group.total += portion.amount;
      group.count += 1;
      group.rows.push(expense);
      groups.set(key, group);
    }
  }
  return finish(groups);
}

const UNCATEGORIZED_LABEL = UNCATEGORISED;

const itemKey = (description: string) => description.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-KE");

/** Expenses filed under what was bought, biggest first; "Milk" and " milk " are one item. */
export function groupExpensesByItem<T extends GroupableExpense>(expenses: readonly T[]): ExpenseGroup<T>[] {
  const groups = new Map<string, ExpenseGroup<T>>();
  for (const expense of expenses) {
    const key = `i:${itemKey(expense.description)}`;
    const group = groups.get(key) ?? { key, label: expense.description.trim() || "No description", total: 0, count: 0, rows: [] };
    group.total += expense.amount;
    group.count += 1;
    group.rows.push(expense);
    groups.set(key, group);
  }
  return finish(groups);
}
