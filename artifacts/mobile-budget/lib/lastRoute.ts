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
// A screen being handed back to (lib/lastRoute markReturning), even from another tab.
let returning: string | null = null;
// The tabs visited, in order, for Back ("when i press go back in the app, it should
// take me to what i was doing previously", 8 Oct 2026). Back used to always go Home.
let trail: string[] = [];
// The tab Back is going to: arriving there is not a new step.
let backingTo: string | null = null;
const TRAIL_MAX = 30;

const pathOnly = (href: string) => href.split('?')[0].replace('/(tabs)', '') || '/';

/** About to send the person back to where they were: that screen keeps its place. */
export function markReturning(href: string): void {
  returning = pathOnly(href);
}

/** Called by the root layout whenever the path changes. */
export function notePath(pathname: string | null | undefined): void {
  if (!pathname || pathname === current) return;
  previous = current;
  current = pathname;
  if (!TAB_PATHS.has(pathname)) return;
  if (backingTo === pathname) {
    backingTo = null;
    return;
  }
  if (trail[trail.length - 1] !== pathname) trail = [...trail, pathname].slice(-TRAIL_MAX);
}

/**
 * Where Back goes from the tab in view: the tab visited before it, as a route,
 * or null when there is none (then Back asks before leaving Jamvi). That tab
 * keeps its place when it is reached.
 */
export function backTarget(): string | null {
  const here = trail[trail.length - 1];
  const rest = here !== undefined && here === current ? trail.slice(0, -1) : [...trail];
  const target = rest[rest.length - 1];
  if (!target) return null;
  trail = rest;
  backingTo = target;
  returning = target;
  return target === '/' ? '/(tabs)' : `/(tabs)${target}`;
}

/** True when the screen now in view was reached by coming back from a screen opened on top of it. */
export function cameBackFromOnTop(): boolean {
  if (returning !== null && returning === current) {
    returning = null;
    return true;
  }
  return previous !== null && !TAB_PATHS.has(previous);
}

/** For tests. */
export function resetRouteHistoryForTests(): void {
  current = null;
  previous = null;
  returning = null;
  trail = [];
  backingTo = null;
}
