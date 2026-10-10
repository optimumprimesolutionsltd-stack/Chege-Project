import { File, Paths } from 'expo-file-system';
import { customFetch } from '@workspace/api-client-react';

/**
 * Footprints of the Import M-Pesa page opening, written straight to a file on
 * the phone as each step is reached (10 Oct 2026: "its the whole page that is
 * unresponsive" - the page froze before it could send a thing, so nothing it
 * did reached the server). The write is synchronous, so a step is on the file
 * even if the very next one never finishes.
 *
 * A page that opens normally deletes the file after a few seconds. A frozen
 * one leaves it, and the next start of Jamvi sends it to the server (as the
 * query of the health check, which is logged) and deletes it: the last step
 * on it is where the page stuck. Step names and milliseconds only.
 */
const NAME = 'jamvi-import-trace.txt';
const KEEP = 120;

let steps: string[] = [];
let on = false;
let openedAt = 0;

function traceFile(): File | null {
  try {
    return new File(Paths.document, NAME);
  } catch {
    return null;
  }
}

function writeOut(): void {
  try {
    const file = traceFile();
    if (!file) return;
    if (!file.exists) file.create();
    file.write(steps.join('\n'));
  } catch {
    // A diagnostic never gets in the way of the page.
  }
}

/** The page has started opening: a fresh trace. */
export function traceOpen(): void {
  on = true;
  openedAt = Date.now();
  steps = [];
  trace('open');
}

/** One step reached, written at once. */
export function trace(step: string): void {
  if (!on) return;
  steps.push(`${Date.now() - openedAt} ${step}`);
  if (steps.length > KEEP) steps = steps.slice(-KEEP);
  writeOut();
}

/** The page opened and answers: nothing to report, so the file goes. */
export function traceSettled(): void {
  if (!on) return;
  on = false;
  steps = [];
  try {
    const file = traceFile();
    if (file?.exists) file.delete();
  } catch {
    /* nothing to do */
  }
}

/**
 * At the next start: a trace left behind by a page that froze, sent to the
 * server in pieces and then deleted. Does nothing when there is none.
 */
export async function sendLeftTrace(): Promise<void> {
  let text = '';
  try {
    const file = traceFile();
    if (!file?.exists) return;
    text = file.textSync();
    file.delete();
  } catch {
    return;
  }
  const lines = text.split('\n').filter(Boolean);
  const pieces: string[] = [];
  for (let at = 0; at < lines.length; at += 20) pieces.push(lines.slice(at, at + 20).join(' | '));
  for (const [index, piece] of pieces.entries()) {
    await customFetch(`/api/healthz?trace=${encodeURIComponent(`${index + 1}/${pieces.length} ${piece}`)}`).catch(() => {});
  }
}
