import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Whether this screen is the one in view. Tab screens stay mounted behind
 * whatever is open, and every big list they held kept following the server:
 * a save in Sort them out reloaded the whole year of entries for Home, Bank,
 * History and Reports at once, and going back waited on all of it ("going back
 * in sort them out is slow", 9 Oct 2026).
 *
 * Passed as `subscribed` to a big query, the screen stops following it while
 * hidden and catches up - one fetch, if anything changed - when it is shown.
 */
export function useOnScreen(): boolean {
  const [onScreen, setOnScreen] = useState(true);
  useFocusEffect(useCallback(() => {
    setOnScreen(true);
    return () => setOnScreen(false);
  }, []));
  return onScreen;
}

/**
 * Options for a generated query hook (useGetX) on a tab screen: follow the
 * server only while the screen is in view. Tab screens stay mounted, and every
 * save anywhere refreshed every query on every tab visited - Home, Bank,
 * History, Reports, Budget, Goals, Settings - at once, behind whatever was open
 * ("looks like this problem is common anywhere there is recalling", 9 Oct 2026).
 * A hidden tab keeps showing what it had, and catches up when shown.
 *
 * The generated hooks work out their own key; their option type only insists
 * on one, so this is passed through untyped.
 */
export function onScreenOnly(onScreen: boolean): { query: never } {
  return { query: { subscribed: onScreen } } as unknown as { query: never };
}
