/**
 * Keeps the screen on while a long save is running, so locking the phone does not suspend
 * it partway through. Only asked for while `saving` is true — the review screen itself can
 * sit open for a while and should still let the screen sleep normally.
 *
 * Native code: only a build that has it can do this (see lib/statementFile.ts for the same
 * pattern). An update reaches every installed copy of the app, old builds included, so the
 * import is guarded and everything here is a no-op on one that lacks it.
 */
type KeepAwakeModule = {
  activateKeepAwakeAsync: (tag?: string) => Promise<void>;
  deactivateKeepAwake: (tag?: string) => void;
};

let keepAwake: KeepAwakeModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  keepAwake = require('expo-keep-awake') as KeepAwakeModule;
} catch {
  keepAwake = null;
}

/** True on a build that can keep the screen on. */
export const canKeepScreenAwake = keepAwake !== null;

const TAG = 'mpesa-import-save';

/** Prevents the screen from sleeping. Best effort: a build without the module, or a device
 *  that refuses for its own reasons, simply leaves the screen's own timeout in charge. */
export async function keepScreenAwakeWhileSaving(): Promise<void> {
  try {
    await keepAwake?.activateKeepAwakeAsync(TAG);
  } catch {
    /* best effort only */
  }
}

/** Lets the screen sleep again once saving is finished, whether it worked or not. */
export function letScreenSleepAgain(): void {
  try {
    keepAwake?.deactivateKeepAwake(TAG);
  } catch {
    /* best effort only */
  }
}
