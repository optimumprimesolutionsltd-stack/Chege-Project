/**
 * One page of an account's history (docs/account-list-paging.md, step 2).
 *
 * GET /api/joint-account sent every entry of every account on each open - Home,
 * Activity and Sort them out asked for all accounts at once, only to add up a
 * month or find a few rows. The rows are still read and their running balances
 * worked out by the database (lib/account-ledger, cheap); what is costly is
 * describing each row (lib/transaction-details), sending it and reading it on a
 * phone. So the rows are chosen here first, and only those are described.
 *
 * - `month` + `year`: only that month's entries, with its money in and out
 *   (every deposit and every withdrawal, as Home has always added them up).
 * - `limit`: at most that many, newest first; `limit=0` for the totals alone.
 * - `before`: the cursor a previous page gave - its last row's id, date and
 *   time saved. A row deleted since is found by its place in the order instead,
 *   so a page never skips or repeats a row.
 * Without any of them, everything, exactly as before: phones not yet updated.
 */

export type PageQuery = { limit?: number; before?: string; month?: number; year?: number };
export type Ordered = { entry: { id: number; type: string; amount: number | string; date: string | Date; createdAt?: string | Date | null } };

const dayOf = (date: string | Date) => (typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10));
const stamp = (value: string | Date | null | undefined) => (value == null ? "" : new Date(value).toISOString());

/** Rows newest first, as lib/account-ledger orders them: date, then created, then id. */
function isAfter(row: Ordered["entry"], cursor: Ordered["entry"]): boolean {
  const a = dayOf(row.date);
  const b = dayOf(cursor.date);
  if (a !== b) return a < b;
  const c = stamp(row.createdAt);
  const d = stamp(cursor.createdAt);
  if (c !== d) return c < d;
  return row.id < cursor.id;
}

/** The cursor for a row: where the next page starts after it. */
export const cursorOf = (row: Ordered["entry"]): string => `${row.id}|${dayOf(row.date)}|${stamp(row.createdAt)}`;

function parseCursor(cursor: string): Ordered["entry"] | null {
  const [id, date, createdAt] = cursor.split("|");
  if (!/^\d+$/.test(id ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return null;
  return { id: Number(id), type: "", amount: 0, date, createdAt: createdAt || null };
}

export function pageOf<T extends Ordered>(
  rows: readonly T[],
  query: PageQuery,
): { rows: T[]; nextCursor: string | null; month: { deposits: number; disbursements: number } | null } {
  const wantsMonth = query.month != null && query.year != null;
  const prefix = wantsMonth ? `${query.year}-${String(query.month).padStart(2, "0")}` : "";
  let list = wantsMonth ? rows.filter((row) => dayOf(row.entry.date).startsWith(prefix)) : [...rows];
  const month = wantsMonth
    ? list.reduce(
      (totals, row) => {
        if (row.entry.type === "deposit") totals.deposits += Number(row.entry.amount);
        if (row.entry.type === "disbursement") totals.disbursements += Number(row.entry.amount);
        return totals;
      },
      { deposits: 0, disbursements: 0 },
    )
    : null;
  if (query.before) {
    const cursor = parseCursor(query.before);
    const at = cursor ? list.findIndex((row) => row.entry.id === cursor.id) : -1;
    if (at !== -1) list = list.slice(at + 1);
    else if (cursor) list = list.filter((row) => isAfter(row.entry, cursor));
  }
  if (query.limit == null) return { rows: list, nextCursor: null, month };
  const page = list.slice(0, Math.max(0, query.limit));
  const more = list.length > page.length && page.length > 0;
  return { rows: page, nextCursor: more ? cursorOf(page[page.length - 1].entry) : null, month };
}
