type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const KEY = 'jamvi:resume-after-update';
const MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Screens worth coming back to. Home, sign-in, onboarding and the plan screen
 * are where a restart lands anyway, and form sheets would reopen empty, so
 * none of those are remembered.
 */
const RESUMABLE = new Set([
  '/budget', '/bank', '/history', '/goals', '/contributions', '/reports', '/settings', '/debt', '/search',
  '/subscription', '/spending-by-item', '/bank-statement', '/bank-day', '/record-contributions',
  '/contribution-plan', '/parties', '/pass-through', '/expense-ledger', '/help',
]);

export function isResumable(pathname: string | null | undefined): pathname is string {
  return typeof pathname === 'string' && RESUMABLE.has(pathname);
}

/** Remember where somebody was, just before an update restarts the app. */
export async function saveResumePoint(pathname: string | null | undefined, storage: Storage, now = Date.now()): Promise<void> {
  if (!isResumable(pathname)) return;
  try {
    await storage.setItem(KEY, JSON.stringify({ pathname, at: now }));
  } catch {
    /* losing it just means landing on Home, as before */
  }
}

/** Where to go back to, once. Always clears the note so it can never fire twice. */
export async function consumeResumePoint(storage: Storage, now = Date.now()): Promise<string | null> {
  try {
    const raw = await storage.getItem(KEY);
    await storage.removeItem(KEY);
    if (!raw) return null;
    const { pathname, at } = JSON.parse(raw) as { pathname?: unknown; at?: unknown };
    if (typeof at !== 'number' || now - at > MAX_AGE_MS || now < at) return null;
    return isResumable(pathname as string) ? (pathname as string) : null;
  } catch {
    return null;
  }
}
