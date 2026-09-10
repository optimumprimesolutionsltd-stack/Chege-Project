/**
 * How the app decides its light/dark palette. Pure so it can be unit-tested
 * without the React Native runtime; the provider lives in hooks/useAppearance.
 *
 * - `system` — follow the phone's own appearance setting (the default).
 * - `white`  — always the light palette.
 * - `midnight` — always the dark palette ("Jamvi night").
 *
 * Mirrors the web app's Appearance setting, with `system` added because a
 * phone has a real OS-level toggle worth deferring to.
 */
export type Appearance = 'system' | 'white' | 'midnight';

export const APPEARANCE_STORAGE_KEY = 'jamvi:appearance';

export const VALID_APPEARANCES: Appearance[] = ['system', 'white', 'midnight'];

export function isAppearance(value: unknown): value is Appearance {
  return typeof value === 'string' && (VALID_APPEARANCES as string[]).includes(value);
}

/** The palette to render for a chosen appearance and the phone's own scheme. */
export function resolveScheme(
  appearance: Appearance,
  systemScheme: 'light' | 'dark' | null | undefined,
): 'light' | 'dark' {
  if (appearance === 'midnight') return 'dark';
  if (appearance === 'white') return 'light';
  return systemScheme === 'dark' ? 'dark' : 'light';
}
