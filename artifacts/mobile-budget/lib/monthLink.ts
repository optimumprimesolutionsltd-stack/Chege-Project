/**
 * A link to one calendar month of a ledger (/expense-ledger or /income-ledger),
 * for a tap on a Reports trend bar ("can these tabs be clickable", 8 Oct 2026).
 */
export function monthLedgerHref(screen: '/expense-ledger' | '/income-ledger', year: number, month: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${screen}?from=${year}-${pad(month)}-01&to=${year}-${pad(month)}-${pad(last)}`;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A from/to handed in by a link, or null when it is missing or not a day. */
export const linkedDay = (value: string | string[] | undefined): string | null =>
  typeof value === 'string' && ISO_DAY.test(value) ? value : null;
