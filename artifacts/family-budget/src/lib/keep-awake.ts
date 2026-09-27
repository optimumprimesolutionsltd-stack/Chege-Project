/**
 * Keeps the screen on while a long save is running, so a laptop or phone locking mid-save
 * does not leave it half finished. Only asked for while saving is happening — the review
 * page itself can sit open for a while and should still let the screen sleep normally.
 *
 * The Wake Lock API is not in every browser (https://caniuse.com/wake-lock). Where it is
 * missing, or a browser refuses it (a background tab, for one), everything here is a no-op
 * and the screen's own timeout stays in charge, the same as before this existed.
 */
let sentinel: WakeLockSentinel | null = null;

export async function keepScreenAwakeWhileSaving(): Promise<void> {
  try {
    if ("wakeLock" in navigator) {
      sentinel = await navigator.wakeLock.request("screen");
    }
  } catch {
    /* best effort only */
  }
}

export function letScreenSleepAgain(): void {
  try {
    void sentinel?.release();
  } catch {
    /* best effort only */
  } finally {
    sentinel = null;
  }
}
