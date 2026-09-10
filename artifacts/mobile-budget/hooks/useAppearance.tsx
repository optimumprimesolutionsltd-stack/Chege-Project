import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  APPEARANCE_STORAGE_KEY,
  isAppearance,
  resolveScheme,
  type Appearance,
} from '@/lib/appearance';

export {
  APPEARANCE_STORAGE_KEY,
  VALID_APPEARANCES,
  resolveScheme,
  type Appearance,
} from '@/lib/appearance';

type AppearanceContextValue = {
  appearance: Appearance;
  /** The palette to actually render, after resolving `system`. */
  resolvedScheme: 'light' | 'dark';
  setAppearance: (next: Appearance) => void;
  /** False until the stored preference has been read once. */
  ready: boolean;
};

const AppearanceContext = createContext<AppearanceContextValue>({
  appearance: 'system',
  resolvedScheme: 'light',
  setAppearance: () => {},
  ready: false,
});

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [appearance, setAppearanceState] = useState<Appearance>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)
      .then((stored) => {
        if (active && isAppearance(stored)) setAppearanceState(stored);
      })
      .catch(() => {
        // A storage read failing just leaves the app on `system`.
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setAppearance = useCallback((next: Appearance) => {
    setAppearanceState(next);
    AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, next).catch(() => {
      // The choice still applies for this session even if it cannot be saved.
    });
  }, []);

  const resolvedScheme = resolveScheme(appearance, system);

  return (
    <AppearanceContext.Provider value={{ appearance, resolvedScheme, setAppearance, ready }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  return useContext(AppearanceContext);
}
