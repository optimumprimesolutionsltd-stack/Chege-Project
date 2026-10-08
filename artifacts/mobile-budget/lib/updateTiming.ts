/**
 * When a downloaded update is put in.
 *
 * "Update now" restarted Jamvi in the middle of whatever the person was doing:
 * the screen came back, but its month, filters, edit mode and place in the list
 * did not ("my issue the update removes me from my current session", 8 Oct
 * 2026). So an update now downloads quietly and goes in at a natural break -
 * the next fresh start, or coming back after a while away - and says what is
 * new once it is in.
 */

type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

/** Away at least this long and coming back is a fresh start, so the update goes in then. */
export const INSTALL_AFTER_AWAY_MS = 5 * 60 * 1000;

const NOTES_KEY = 'jamvi:update-whats-new';

/**
 * Just opened and not yet used: the same natural break as coming back after a
 * while. Without this, closing and reopening Jamvi only downloaded an update -
 * the first open ran the old version - so it took a second reopen, and "didnt
 * get it" (8 Oct 2026).
 */
export const FRESH_START_MS = 20 * 1000;

export function shouldInstallAtStart({ msSinceStart, saving, pathname }: { msSinceStart: number; saving: boolean; pathname: string | null }): boolean {
  return !saving && msSinceStart <= FRESH_START_MS && (pathname === null || pathname === '/' || pathname === '/login');
}

export function shouldInstallOnReturn({ downloaded, awayMs, saving }: { downloaded: boolean; awayMs: number | null; saving: boolean }): boolean {
  return downloaded && !saving && awayMs !== null && awayMs >= INSTALL_AFTER_AWAY_MS;
}

/** Kept with the update it came with, to be shown once that update is running. */
export async function keepWhatsNew(updateId: string | null | undefined, notes: string[], storage: Storage): Promise<void> {
  if (!updateId) return;
  try {
    await storage.setItem(NOTES_KEY, JSON.stringify({ updateId, notes }));
  } catch {
    /* only the note is lost; the update still goes in */
  }
}

/**
 * What is new, once, when the update it was kept for is the one running;
 * until then it waits.
 */
export async function takeWhatsNew(runningUpdateId: string | null | undefined, storage: Storage): Promise<string[] | null> {
  try {
    const raw = await storage.getItem(NOTES_KEY);
    if (!raw || !runningUpdateId) return null;
    const { updateId, notes } = JSON.parse(raw) as { updateId?: unknown; notes?: unknown };
    if (updateId !== runningUpdateId) return null;
    await storage.removeItem(NOTES_KEY);
    return Array.isArray(notes) ? notes.filter((note): note is string => typeof note === 'string') : [];
  } catch {
    return null;
  }
}
