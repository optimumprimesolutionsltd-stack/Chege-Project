/**
 * Possible duplicates: one payment recorded twice, typed by hand and brought in
 * from M-Pesa (api-server lib/possible-duplicates). The person settles each pair:
 *
 * - "Same payment": the M-Pesa one stays - it has the code, so it can never be
 *   saved twice again - and the typed one is removed. If the M-Pesa one is still
 *   on "Not sure yet" (or has no category), it takes the typed one's category
 *   first, so nothing the person already said is lost.
 * - "Different payments": both stay, and the pair is never shown again.
 *
 * Shared with the web (sync-web-twins.py).
 */

export type DuplicateSide = {
  kind: 'expense' | 'entry' | 'imported';
  id: number;
  date: string;
  amount: number;
  description: string;
  category: string | null;
  receipt: string | null;
};

export type DuplicatePair = { typed: DuplicateSide; imported: DuplicateSide };

const NOT_SURE = 'not sure yet';

/** The category the M-Pesa entry should take from the typed one, or null to leave it as it is. */
export function categoryToKeep(pair: DuplicatePair): string | null {
  const typed = (pair.typed.category ?? '').trim();
  const imported = (pair.imported.category ?? '').trim();
  if (!typed || typed.toLowerCase() === NOT_SURE) return null;
  if (imported && imported.toLowerCase() !== NOT_SURE) return null;
  return typed;
}

/** Where the typed entry is deleted: an expense, or an entry on an account. */
export const deletePathFor = (typed: DuplicateSide): string =>
  typed.kind === 'expense' ? `/api/expenses/${typed.id}` : `/api/joint-account/${typed.id}`;

/** A stable key for a pair, for lists and for marking one busy. */
export const pairKey = (pair: DuplicatePair): string => `${pair.typed.kind}-${pair.typed.id}-${pair.imported.id}`;

/** Home's line: how many pairs wait. */
export const duplicatesTitle = (count: number): string =>
  count === 1 ? '1 payment may be recorded twice' : `${count} payments may be recorded twice`;

/** What "Same payment" will do, asked before it is done. */
export function sameQuestion(pair: DuplicatePair): string {
  const kept = categoryToKeep(pair);
  return [
    `"${pair.typed.description}" you typed on ${pair.typed.date} will be removed.`,
    `"${pair.imported.description}" from M-Pesa${pair.imported.receipt ? ` (${pair.imported.receipt})` : ''} stays${kept ? ` and is filed under ${kept}` : ''}.`,
  ].join('\n');
}
