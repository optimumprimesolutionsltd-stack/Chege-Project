/**
 * How long a delete waits for Undo before it reaches the server, and the
 * words for what was deleted. Shared with the web (sync-web-twins.py).
 */
export const UNDO_DELETE_MS = 8_000;

const kes = (amount: number) => `KES ${Math.round(Math.abs(amount)).toLocaleString('en-KE')}`;

/** "Naivas (KES 1,200)" - short enough for the Undo bar. */
export function deletedLabel(description: string | null | undefined, amount?: number | null): string {
  const name = (description ?? '').trim() || 'entry';
  const short = name.length > 28 ? `${name.slice(0, 27)}…` : name;
  return amount != null ? `${short} (${kes(amount)})` : short;
}
