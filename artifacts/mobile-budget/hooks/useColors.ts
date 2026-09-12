import { useMemo } from 'react';
import colors from '@/constants/colors';
import { useAppearance } from '@/hooks/useAppearance';

/**
 * Returns the design tokens for the active color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * The scheme comes from the app's Appearance setting (Settings → Appearance):
 * `system` follows the phone, `white` forces light, `midnight` forces dark.
 * Falls back to the light palette when no `dark` key is defined in
 * constants/colors.ts.
 */
export function useColors() {
  const { resolvedScheme } = useAppearance();
  // Memoised on the scheme, which is the only thing that can change it.
  //
  // This used to spread a fresh object on every render, in all thirty-odd
  // components that call it. That made the palette a new identity every time
  // anything re-rendered, which quietly defeated every React.memo it was
  // passed to and invalidated any useMemo that depended on it - so a screen
  // could not be memoised even deliberately. On the expense form, where every
  // keystroke re-renders the tree, that is the difference between rebuilding
  // six lists and skipping them.
  return useMemo(() => {
    const palette =
      resolvedScheme === 'dark' && 'dark' in colors
        ? (colors as unknown as Record<string, typeof colors.light>).dark
        : colors.light;
    return { ...palette, radius: colors.radius };
  }, [resolvedScheme]);
}
