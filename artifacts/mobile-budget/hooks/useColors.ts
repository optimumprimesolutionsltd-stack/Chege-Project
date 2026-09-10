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
  const palette =
    resolvedScheme === 'dark' && 'dark' in colors
      ? (colors as unknown as Record<string, typeof colors.light>).dark
      : colors.light;
  return { ...palette, radius: colors.radius };
}
