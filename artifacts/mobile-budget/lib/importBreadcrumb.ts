import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where a statement import had got to, kept on the phone while it runs, so
 * that if the app is closed part-way - by Android, short of memory, or a crash
 * - the import screen can say so the next time it opens, instead of the person
 * finding an empty screen with no idea what happened. No crash report reaches
 * us from a phone; this is the trace that survives.
 *
 * Only the stage is kept ("reading page 87 of 133", "saving 1,240 of 4,585"),
 * never anything from the statement itself.
 */

const KEY = 'jamvi:import-step';
// Which run of the app wrote it: a step left by an earlier run means that run
// ended mid-import.
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const WRITE_EVERY_MS = 2_000;

export type ImportStep = { step: string; at: number; run: string };

let lastWrite = 0;
let lastStage = '';

/** Notes the current step. Stage changes are written at once; progress within one at most every two seconds. */
export function noteImportStep(step: string, stage: string): void {
  const now = Date.now();
  if (stage === lastStage && now - lastWrite < WRITE_EVERY_MS) return;
  lastStage = stage;
  lastWrite = now;
  AsyncStorage.setItem(KEY, JSON.stringify({ step, at: now, run: RUN } satisfies ImportStep)).catch(() => {});
}

/** The import finished, failed with a message on screen, or was left on purpose. */
export function clearImportStep(): void {
  lastStage = '';
  lastWrite = 0;
  AsyncStorage.removeItem(KEY).catch(() => {});
}

/** A step an earlier run of the app left behind: it was closed mid-import. */
export async function readUnfinishedImport(): Promise<ImportStep | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as ImportStep;
    if (typeof record?.step !== 'string' || record.run === RUN) return null;
    return record;
  } catch {
    return null;
  }
}
