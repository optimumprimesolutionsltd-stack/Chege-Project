/**
 * Which menu items sit in the main list and which fold under "More".
 *
 * The sidebar grew to sixteen entries. Someone new (or twelve) cannot tell
 * which of sixteen matter, so Simple view keeps the everyday ones on show and
 * folds the rest under one "More" line, one click away. Nothing is removed and
 * every page keeps its address.
 */
export const SIMPLE_NAV_KEY = "jamvi:simple-view";

/** The pages a person uses daily, plus the two that are never hideable. */
const EVERYDAY = new Set([
  "/",
  "/contributions",
  "/expenses",
  "/budget",
  "/activity",
  "/savings-goals",
  "/bank",
  "/subscription",
  "/settings",
]);

export type NavEntry = { href: string };

export function splitNav<T extends NavEntry>(
  items: readonly T[],
  simple: boolean,
  location: string,
): { main: T[]; more: T[]; moreOpenByDefault: boolean } {
  if (!simple) return { main: [...items], more: [], moreOpenByDefault: false };
  const main = items.filter((item) => EVERYDAY.has(item.href));
  const more = items.filter((item) => !EVERYDAY.has(item.href));
  // Landing on a page that lives under More must not hide it from view.
  return { main, more, moreOpenByDefault: more.some((item) => item.href === location) };
}

/** On unless somebody switched it off on this browser. */
export function readSimpleNav(storage: Pick<Storage, "getItem"> | undefined): boolean {
  try {
    return storage?.getItem(SIMPLE_NAV_KEY) !== "off";
  } catch {
    return true;
  }
}
