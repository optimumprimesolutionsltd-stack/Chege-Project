/**
 * A statement save that was started and has not finished, remembered in this
 * browser for each workspace - as the phone does (mobile-budget
 * lib/importSaveJob.ts).
 *
 * Closing the tab, or the browser, part way through a save stopped it, and
 * opening the import again showed the entries as if nothing had been saved.
 * Set when a save starts and cleared when it finishes, so one still here when
 * the import opens is a save that was cut short - and the import finishes it,
 * skipping whatever already reached the server.
 */
const key = (groupId: number) => `jamvi:import-save-pending:${groupId}`;

/** An interrupted save older than this is not resumed by itself. */
export const PENDING_SAVE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function markSavePending(groupId: number | null | undefined): void {
  if (!groupId) return;
  try {
    window.localStorage.setItem(key(groupId), JSON.stringify({ startedAt: Date.now() }));
  } catch {
    // Without it, an interrupted save simply waits for Save again.
  }
}

export function clearSavePending(groupId: number | null | undefined): void {
  if (!groupId) return;
  try {
    window.localStorage.removeItem(key(groupId));
  } catch {
    // Harmless: the next import finds nothing left to save and clears it then.
  }
}

export function hasPendingSave(groupId: number | null | undefined, now: number = Date.now()): boolean {
  if (!groupId) return false;
  try {
    const raw = window.localStorage.getItem(key(groupId));
    if (!raw) return false;
    const { startedAt } = JSON.parse(raw) as { startedAt?: number };
    return typeof startedAt === "number" && now - startedAt < PENDING_SAVE_MAX_AGE_MS;
  } catch {
    return false;
  }
}
