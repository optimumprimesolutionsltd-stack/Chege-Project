/**
 * Searching the Bank tab's list: "put a search button" (7 Oct 2026). A year of
 * M-Pesa is a couple of thousand entries; scrolling for one is not a way to
 * find it.
 *
 * Every word typed must appear somewhere in the entry - its description, the
 * category, a note, the M-Pesa code, who it was with, the savings goal or the
 * other account - or the amount must match the number typed ("3500", "3,500").
 */
export type SearchableTx = {
  description?: string | null;
  expenseCategory?: string | null;
  notes?: string | null;
  mpesaReceipt?: string | null;
  madeByName?: string | null;
  debtPartyName?: string | null;
  savingsGoalName?: string | null;
  bankTransferAccountName?: string | null;
  amount: number;
};

const fold = (text: string) => text.toLocaleLowerCase('en-KE').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

export function matchesSearch(tx: SearchableTx, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = fold([
    tx.description, tx.expenseCategory, tx.notes, tx.mpesaReceipt, tx.madeByName,
    tx.debtPartyName, tx.savingsGoalName, tx.bankTransferAccountName,
  ].filter(Boolean).join(' '));
  const amount = String(Math.round(Math.abs(Number(tx.amount) || 0)));
  return words.every((word) => {
    const digits = word.replace(/[,\s]/g, '').replace(/^(kes|ksh)/, '');
    if (/^\d+(\.\d+)?$/.test(digits)) return amount === String(Math.round(Number(digits))) || text.includes(word);
    return text.includes(word);
  });
}
