import { useState, useEffect } from 'react';

type ThemeName = 'default' | 'subtle-gray' | 'subtle-green' | 'subtle-blue';

const STORAGE_KEY = 'mpesa-parser-lab-theme';

export function useTheme() {
  const [theme, setTheme] = useState<ThemeName>('default');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemeName;
      if (stored && ['default', 'subtle-gray', 'subtle-green', 'subtle-blue'].includes(stored)) {
        setTheme(stored);
      }
    } catch (e) {
      // Ignore
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'default') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return { theme, setTheme };
}
