/**
 * How the web app decides its light/dark look, as on the phone (mobile-budget
 * lib/appearance.ts):
 *
 * - `system`   - follow this device's own light/dark setting (the default).
 * - `white`    - always the light look.
 * - `midnight` - always the dark look ("Jamvi night").
 *
 * The web had no `system` and fell back to `midnight`, so every new user got
 * Jamvi night whatever their device said.
 */
export type Appearance = "system" | "white" | "midnight";

export const APPEARANCE_STORAGE_KEY = "jamvi:appearance";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isAppearance(value: unknown): value is Appearance {
  return value === "system" || value === "white" || value === "midnight";
}

export function readAppearance(): Appearance {
  if (typeof window === "undefined") return "system";

  try {
    const stored = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return isAppearance(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function deviceIsDark(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia?.(DARK_QUERY).matches === true;
  } catch {
    return false;
  }
}

/** The look to draw for a choice: `system` asks the device. */
export function resolveAppearance(appearance: Appearance, deviceDark: boolean = deviceIsDark()): "white" | "midnight" {
  if (appearance === "system") return deviceDark ? "midnight" : "white";
  return appearance;
}

export function applyAppearance(appearance: Appearance): void {
  if (typeof document === "undefined") return;

  const look = resolveAppearance(appearance);
  document.documentElement.classList.toggle("dark", look === "midnight");
  document.documentElement.dataset.appearance = look;
}

/**
 * Keeps following the device while the choice is `system`: switching the
 * device to dark at sunset switches Jamvi too. Returns the way to stop.
 */
export function followDeviceAppearance(): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(DARK_QUERY);
  const onChange = () => {
    if (readAppearance() === "system") applyAppearance("system");
  };
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}

export function saveAppearance(appearance: Appearance): void {
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, appearance);
  } catch {
    // A browser can block local storage; the current selection still applies.
  }
}
