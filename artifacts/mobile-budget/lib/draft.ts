import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { markUnsavedWork } from '@/lib/unsavedWork';

const PREFIX = 'jamvi:draft:';

/** A draft older than this is left behind: it is somebody's yesterday, not their unfinished work. */
export const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

type Stored<T> = { savedAt: number; value: T };

/** What was stored, or null when it is missing, damaged or too old. */
export function parseDraft<T>(raw: string | null | undefined, now: number = Date.now(), maxAgeMs: number = DRAFT_MAX_AGE_MS): T | null {
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as Partial<Stored<T>> | null;
    if (!stored || typeof stored.savedAt !== 'number' || stored.value === undefined || stored.value === null) return null;
    if (now - stored.savedAt > maxAgeMs) return null;
    return stored.value as T;
  } catch {
    return null;
  }
}

/**
 * Keeps a screen's unfinished work across an update restart, a crash or a switch
 * of budget, and gives it back the next time the screen opens.
 *
 * An update reloads the whole app, and the "return to the screen you were on"
 * fix only brought somebody back to an empty copy of it. While `active` is true
 * the value is written down a moment after each change; when it is false (nothing
 * to keep, or it was saved) the draft is removed. Nothing is restored that is
 * older than a day's work.
 */
export function useDraft<T>({
  key,
  value,
  active,
  onRestore,
  maxAgeMs = DRAFT_MAX_AGE_MS,
}: {
  key: string;
  value: T;
  active: boolean;
  onRestore: (saved: T) => void;
  /** How long it is kept. A statement is worked through over days, a paste over an afternoon. */
  maxAgeMs?: number;
}): { restored: boolean; dismiss: () => void; discard: () => void } {
  const [restored, setRestored] = useState(false);
  // Nothing is written or removed until the stored draft has been looked at,
  // or the empty screen would erase it before it could be read back.
  const [ready, setReady] = useState(false);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(PREFIX + key)
      .then((raw) => {
        if (!alive) return;
        const saved = parseDraft<T>(raw, Date.now(), maxAgeMs);
        if (saved !== null) {
          onRestoreRef.current(saved);
          setRestored(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [key]);

  const serialized = JSON.stringify(value);
  useEffect(() => {
    markUnsavedWork(key, active);
    if (!ready) return;
    if (!active) {
      AsyncStorage.removeItem(PREFIX + key).catch(() => {});
      return;
    }
    const timer = setTimeout(() => {
      AsyncStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), value: JSON.parse(serialized) })).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [key, ready, active, serialized]);

  useEffect(() => () => markUnsavedWork(key, false), [key]);

  const dismiss = useCallback(() => setRestored(false), []);
  const discard = useCallback(() => {
    setRestored(false);
    AsyncStorage.removeItem(PREFIX + key).catch(() => {});
  }, [key]);

  return { restored, dismiss, discard };
}
