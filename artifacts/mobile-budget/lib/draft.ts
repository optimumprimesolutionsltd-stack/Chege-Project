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
  manual = false,
}: {
  key: string;
  value: T;
  active: boolean;
  onRestore: (saved: T) => void;
  /** How long it is kept. A statement is worked through over days, a paste over an afternoon. */
  maxAgeMs?: number;
  /**
   * Given back only when the person asks (resume), not as the screen opens. A
   * statement's review is thousands of entries: restored by itself, it held
   * Import M-Pesa still for half a minute every time it opened, whatever the
   * person came to do (10 Oct 2026, 2,512 entries). Until resumed or
   * discarded, the stored draft is neither overwritten nor removed.
   */
  manual?: boolean;
}): { restored: boolean; dismiss: () => void; discard: () => void; waiting: T | null; resume: () => void } {
  const [restored, setRestored] = useState(false);
  const [waiting, setWaitingState] = useState<T | null>(null);
  const waitingRef = useRef<T | null>(null);
  const setWaiting = (next: T | null) => {
    waitingRef.current = next;
    setWaitingState(next);
  };
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
        if (saved === null) return;
        if (manual) {
          setWaiting(saved);
          return;
        }
        onRestoreRef.current(saved);
        setRestored(true);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [key]);

  // Written a moment after the screen goes quiet, and only when it changed. It
  // used to be turned into text on every draw - a statement's review is over a
  // megabyte - which a phone felt on every tap (10 Oct 2026).
  const valueRef = useRef(value);
  valueRef.current = value;
  const lastWritten = useRef<string | null>(null);
  useEffect(() => {
    markUnsavedWork(key, active);
    if (!ready) return;
    if (waiting !== null) {
      // A draft still waiting is kept while the screen holds nothing new; new
      // work - another statement read meanwhile - takes its place.
      if (!active) return;
      setWaiting(null);
    }
    if (!active) {
      if (lastWritten.current !== '') AsyncStorage.removeItem(PREFIX + key).catch(() => {});
      lastWritten.current = '';
      return;
    }
    const timer = setTimeout(() => {
      const serialized = JSON.stringify(valueRef.current);
      if (serialized === lastWritten.current) return;
      lastWritten.current = serialized;
      AsyncStorage.setItem(PREFIX + key, `{"savedAt":${Date.now()},"value":${serialized}}`).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  });

  useEffect(() => () => markUnsavedWork(key, false), [key]);

  const dismiss = useCallback(() => setRestored(false), []);
  const discard = useCallback(() => {
    setRestored(false);
    setWaiting(null);
    lastWritten.current = '';
    AsyncStorage.removeItem(PREFIX + key).catch(() => {});
  }, [key]);
  const resume = useCallback(() => {
    const saved = waitingRef.current;
    if (saved === null) return;
    setWaiting(null);
    onRestoreRef.current(saved);
    setRestored(true);
  }, []);

  return { restored, dismiss, discard, waiting, resume };
}
