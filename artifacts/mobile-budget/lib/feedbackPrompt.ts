/**
 * When to nudge someone for feedback, without becoming the thing they give
 * feedback about. Three rules: give the app a real chance to be used first,
 * never ask again soon after asking, and never ask again soon after someone
 * already told us what they think through Settings.
 */
import type AsyncStorageType from '@react-native-async-storage/async-storage';

type Storage = Pick<typeof AsyncStorageType, 'getItem' | 'setItem'>;

const LAUNCH_COUNT_KEY = 'jamvi:feedback-prompt:launch-count';
const LAST_SHOWN_KEY = 'jamvi:feedback-prompt:last-shown';
const SUBMITTED_KEY = 'jamvi:feedback-prompt:submitted-at';

const MIN_LAUNCHES_BEFORE_FIRST_PROMPT = 6;
const MIN_DAYS_BETWEEN_PROMPTS = 45;

export async function recordAppLaunch(storage: Storage): Promise<number> {
  const raw = await storage.getItem(LAUNCH_COUNT_KEY);
  const count = (raw ? parseInt(raw, 10) || 0 : 0) + 1;
  await storage.setItem(LAUNCH_COUNT_KEY, String(count));
  return count;
}

export async function markFeedbackSubmitted(storage: Storage): Promise<void> {
  await storage.setItem(SUBMITTED_KEY, new Date().toISOString());
}

export async function markFeedbackPromptShown(storage: Storage): Promise<void> {
  await storage.setItem(LAST_SHOWN_KEY, new Date().toISOString());
}

function daysSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

export async function shouldShowFeedbackPrompt(
  launchCount: number,
  storage: Storage,
  now: Date = new Date(),
): Promise<boolean> {
  if (launchCount < MIN_LAUNCHES_BEFORE_FIRST_PROMPT) return false;
  const [lastShown, submittedAt] = await Promise.all([
    storage.getItem(LAST_SHOWN_KEY),
    storage.getItem(SUBMITTED_KEY),
  ]);
  if (submittedAt && daysSince(submittedAt, now) < MIN_DAYS_BETWEEN_PROMPTS) return false;
  if (lastShown && daysSince(lastShown, now) < MIN_DAYS_BETWEEN_PROMPTS) return false;
  return true;
}
