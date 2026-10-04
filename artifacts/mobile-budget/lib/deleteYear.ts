/** A past year the Personal budget holds entries in, as /api/budget-years lists it. */
export type PastYear = { year: number; expenses: number; bankEntries: number; contributions: number };

const many = (count: number, one: string, more: string) => `${count.toLocaleString('en-KE')} ${count === 1 ? one : more}`;

/** "1,204 M-Pesa and bank entries and 37 expenses will be deleted." */
export function yearSummary(year: PastYear): string {
  const parts = [
    year.bankEntries > 0 ? many(year.bankEntries, 'M-Pesa or bank entry', 'M-Pesa and bank entries') : null,
    year.expenses > 0 ? many(year.expenses, 'expense', 'expenses') : null,
    year.contributions > 0 ? many(year.contributions, 'contribution', 'contributions') : null,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return 'Nothing is recorded in it.';
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${list} will be deleted.`;
}
