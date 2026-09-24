import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SIMPLE_VIEW_KEY = 'jamvi:simple-view';

// On unless somebody switched it off: a first-time user, or a child, should
// meet the small tab bar, and the way back to every tab is on the More screen.
let simple = true;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function setSimpleView(next: boolean): void {
  simple = next;
  emit();
  AsyncStorage.setItem(SIMPLE_VIEW_KEY, next ? 'on' : 'off').catch(() => {});
}

async function loadOnce(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const stored = await AsyncStorage.getItem(SIMPLE_VIEW_KEY);
    if (stored === 'off' && simple) {
      simple = false;
      emit();
    }
  } catch {
    // Storage can be unavailable; the default stands.
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** [simple, set] — the choice is kept on this device. */
export function useSimpleView(): readonly [boolean, (next: boolean) => void] {
  useEffect(() => {
    void loadOnce();
  }, []);
  const value = useSyncExternalStore(subscribe, () => simple, () => simple);
  return [value, setSimpleView] as const;
}
