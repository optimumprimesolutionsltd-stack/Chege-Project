import { useCallback, useEffect, useState } from 'react';
import { LayoutAnimation, Platform, UIManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Whether a panel is showing its full detail or just a summary line.
 *
 * The app defaults to summaries — a screen full of figures is intimidating —
 * and remembers, per viewer, which panels a person chose to open. Nothing is
 * removed; "See details" is always one tap away.
 */
export function useCollapsed(storageKey: string, defaultOpen = false) {
  const key = `jamvi:collapse:${storageKey}`;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(key)
      .then((value) => {
        if (active && (value === 'open' || value === 'closed')) setOpen(value === 'open');
      })
      .catch(() => {
        // No stored preference — keep the default.
      });
    return () => {
      active = false;
    };
  }, [key]);

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((current) => {
      const next = !current;
      void AsyncStorage.setItem(key, next ? 'open' : 'closed').catch(() => {});
      return next;
    });
  }, [key]);

  return { open, toggle };
}
