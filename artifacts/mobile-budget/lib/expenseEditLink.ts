export type ExpenseEditTarget = {
  id: number;
  date: string;
};

export type ExpenseActivityTarget = {
  id: string;
  type: string;
  date: string;
  editTarget?: string;
};

function getMonthContext(date: string): { month: number; year: number } | null {
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return { month, year };
}

export function getExpenseEditHref({ id, date }: ExpenseEditTarget): string {
  const context = getMonthContext(date);
  const params = new URLSearchParams({ edit: String(id) });
  if (context) {
    params.set('month', String(context.month));
    params.set('year', String(context.year));
  }
  return `/add-expense?${params.toString()}`;
}

export function getExpenseActivityEditHref(item: ExpenseActivityTarget): string | null {
  if (item.type !== 'expense' || (item.editTarget && item.editTarget !== 'expense')) return null;
  const match = /^expense-(\d+)$/.exec(item.id);
  if (!match) return null;
  return getExpenseEditHref({ id: Number(match[1]), date: item.date });
}

export function getLedgerExpenseEditHref(entry: {
  id: string;
  source: string;
  date: string;
}): string | null {
  if (entry.source !== 'expense') return null;
  const match = /^expense-(\d+)$/.exec(entry.id);
  if (!match) return null;
  return getExpenseEditHref({ id: Number(match[1]), date: entry.date });
}