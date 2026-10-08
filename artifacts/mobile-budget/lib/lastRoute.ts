/**
 * Where the person was before the screen they are on now.
 *
 * Main screens scroll back to their top when they come into view, so a tab
 * opened from another tab starts at its heading. Coming back from a screen
 * opened on top of it is different: "in banking if i press the not sure button
 * and then go back, it takes me off what i was doing" (8 Oct 2026). So the
 * reset only happens when the person arrives from another tab.
 */
const TAB_PATHS = new Set([
  '/', '/budget', '/bank', '/history', '/goals', '/contributions', '/reports', '/settings', '/debt', '/search', '/more',
]);

let current: string | null = null;
let previous: string | null = null;

/** Called by the root layout whenever the path changes. */
export function notePath(pathname: string | null | undefined): void {
  if (!pathname || pathname === current) return;
  previous = current;
  current = pathname;
}

/** True when the screen now in view was reached by coming back from a screen opened on top of it. */
export function cameBackFromOnTop(): boolean {
  return previous !== null && !TAB_PATHS.has(previous);
}

/** For tests. */
export function resetRouteHistoryForTests(): void {
  current = null;
  previous = null;
}
