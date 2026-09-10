import AsyncStorage from '@react-native-async-storage/async-storage';
import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query';

/**
 * A minimal React Query persister for AsyncStorage.
 *
 * On a cold start the app otherwise shows a spinner on every screen until each
 * query's first network round trip returns. Restoring the last successful
 * results lets screens paint immediately and refetch in the background.
 *
 * Deliberately tiny — no extra dependency. Only successful queries are saved,
 * the whole blob is dropped once it is a day old, and every failure is
 * swallowed: a persistence problem must never break the app.
 */
const CACHE_KEY = 'jamvi:rq-cache:v1';
const MAX_AGE_MS = 1000 * 60 * 60 * 24;
const WRITE_DEBOUNCE_MS = 1500;

export async function hydrateQueryClient(client: QueryClient): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { savedAt?: number; state?: unknown };
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      await AsyncStorage.removeItem(CACHE_KEY);
      return;
    }
    hydrate(client, parsed.state);
  } catch {
    // A corrupt or unreadable cache is the same as no cache.
  }
}

/** Start persisting; returns a stop function for cleanup. */
export function startPersistingQueryClient(client: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    try {
      const state = dehydrate(client, {
        shouldDehydrateQuery: (query) => query.state.status === 'success',
      });
      void AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), state })).catch(() => {});
    } catch {
      // Ignore — the next cache change will try again.
    }
  };

  const unsubscribe = client.getQueryCache().subscribe(() => {
    if (timer) return;
    timer = setTimeout(flush, WRITE_DEBOUNCE_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}

export async function clearQueryClientCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {
    // Nothing to do.
  }
}
