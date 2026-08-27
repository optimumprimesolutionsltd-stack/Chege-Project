export type Appearance = "white" | "midnight";

export const APPEARANCE_STORAGE_KEY = "jamvi:appearance";

export function readAppearance(): Appearance {
  if (typeof window === "undefined") return "white";

  try {
    return window.localStorage.getItem(APPEARANCE_STORAGE_KEY) === "midnight"
      ? "midnight"
      : "white";
  } catch {
    return "white";
  }
}

export function applyAppearance(appearance: Appearance): void {
  if (typeof document === "undefined") return;

  document.documentElement.classList.toggle("dark", appearance === "midnight");
  document.documentElement.dataset.appearance = appearance;
}

export function saveAppearance(appearance: Appearance): void {
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, appearance);
  } catch {
    // A browser can block local storage; the current selection still applies.
  }
}