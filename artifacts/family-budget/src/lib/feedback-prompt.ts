/**
 * When to nudge someone for feedback on the web app — same rules as
 * mobile's lib/feedbackPrompt.ts: give the app a real chance to be used
 * first, never ask again soon after asking, and never ask again soon after
 * someone already told us what they think through Settings.
 *
 * Storage is injected rather than reading window.localStorage directly, so
 * this stays plain, synchronous logic testable without a DOM - callers pass
 * `browserFeedbackStorage()` in the app, a fake in tests.
 */
export interface FeedbackPromptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const LAUNCH_COUNT_KEY = "jamvi:feedback-prompt:launch-count";
const LAST_SHOWN_KEY = "jamvi:feedback-prompt:last-shown";
const SUBMITTED_KEY = "jamvi:feedback-prompt:submitted-at";

const MIN_LAUNCHES_BEFORE_FIRST_PROMPT = 6;
const MIN_DAYS_BETWEEN_PROMPTS = 45;

/** window.localStorage, guarded for private browsing and a full quota. */
export function browserFeedbackStorage(): FeedbackPromptStorage {
  return {
    getItem: (key) => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Asking again next visit is fine.
      }
    },
  };
}

export function recordAppLaunch(storage: FeedbackPromptStorage): number {
  const count = (parseInt(storage.getItem(LAUNCH_COUNT_KEY) ?? "0", 10) || 0) + 1;
  storage.setItem(LAUNCH_COUNT_KEY, String(count));
  return count;
}

export function markFeedbackSubmitted(storage: FeedbackPromptStorage): void {
  storage.setItem(SUBMITTED_KEY, new Date().toISOString());
}

export function markFeedbackPromptShown(storage: FeedbackPromptStorage): void {
  storage.setItem(LAST_SHOWN_KEY, new Date().toISOString());
}

function daysSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

export function shouldShowFeedbackPrompt(
  launchCount: number,
  storage: FeedbackPromptStorage,
  now: Date = new Date(),
): boolean {
  if (launchCount < MIN_LAUNCHES_BEFORE_FIRST_PROMPT) return false;
  const lastShown = storage.getItem(LAST_SHOWN_KEY);
  const submittedAt = storage.getItem(SUBMITTED_KEY);
  if (submittedAt && daysSince(submittedAt, now) < MIN_DAYS_BETWEEN_PROMPTS) return false;
  if (lastShown && daysSince(lastShown, now) < MIN_DAYS_BETWEEN_PROMPTS) return false;
  return true;
}
