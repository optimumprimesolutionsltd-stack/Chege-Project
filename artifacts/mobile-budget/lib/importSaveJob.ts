import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A statement save that was started and has not finished, remembered on this
 * phone for each workspace.
 *
 * A save of a few hundred entries takes minutes. It carries on while the
 * person moves around Jamvi, but closing the app (or the phone closing it)
 * stopped it, and nothing carried it on: they came back to their entries and
 * had to save again. Set when a save starts and cleared when it finishes, so
 * one still here when the import opens is a save that was cut short - and the
 * import finishes it, skipping whatever already reached the server.
 */
const KEY = (groupId: number) => `jamvi:import-save-pending:${groupId}`;

/** An interrupted save older than this is not resumed by itself. */
export const PENDING_SAVE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function markSavePending(groupId: number | null | undefined): Promise<void> {
  if (!groupId) return;
  try {
    await AsyncStorage.setItem(KEY(groupId), JSON.stringify({ startedAt: Date.now() }));
  } catch {
    // Without it, an interrupted save simply waits for Save again, as before.
  }
}

export async function clearSavePending(groupId: number | null | undefined): Promise<void> {
  if (!groupId) return;
  try {
    await AsyncStorage.removeItem(KEY(groupId));
  } catch {
    // Harmless: the next import finds nothing left to save and clears it then.
  }
}

/** Whether a save started in this workspace was cut short, recently enough to finish. */
export async function hasPendingSave(groupId: number | null | undefined, now: number = Date.now()): Promise<boolean> {
  if (!groupId) return false;
  try {
    const raw = await AsyncStorage.getItem(KEY(groupId));
    if (!raw) return false;
    const { startedAt } = JSON.parse(raw) as { startedAt?: number };
    return typeof startedAt === 'number' && now - startedAt < PENDING_SAVE_MAX_AGE_MS;
  } catch {
    return false;
  }
}
