import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The person's own arrangement of a list of shortcuts - Home's group areas,
 * the quick-action bar: the order they chose, and which they hid. Kept on the
 * phone; a convenience, so losing it only puts the default order back.
 */
export type Arrangement = { order: string[]; hidden: string[] };

export const EMPTY_ARRANGEMENT: Arrangement = { order: [], hidden: [] };

/**
 * The items in the person's order, hidden ones left out. Items they have not
 * arranged yet (a new shortcut added later) follow in their default order, so
 * nothing new is ever lost behind an old arrangement.
 */
export function arrange<T extends { id: string }>(items: readonly T[], arrangement: Arrangement, includeHidden = false): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = [
    ...arrangement.order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
    ...items.filter((item) => !arrangement.order.includes(item.id)),
  ];
  return includeHidden ? ordered : ordered.filter((item) => !arrangement.hidden.includes(item.id));
}

/** One step up (-1) or down (+1) in the arranged order. */
export function moveItem<T extends { id: string }>(items: readonly T[], arrangement: Arrangement, id: string, step: -1 | 1): Arrangement {
  const order = arrange(items, arrangement, true).map((item) => item.id);
  const at = order.indexOf(id);
  const to = at + step;
  if (at < 0 || to < 0 || to >= order.length) return { ...arrangement, order };
  [order[at], order[to]] = [order[to], order[at]];
  return { ...arrangement, order };
}

/** Moved to a position in the arranged order, as a drag drops it. */
export function moveItemTo<T extends { id: string }>(items: readonly T[], arrangement: Arrangement, id: string, toIndex: number): Arrangement {
  const order = arrange(items, arrangement, true).map((item) => item.id);
  const from = order.indexOf(id);
  if (from < 0) return { ...arrangement, order };
  const to = Math.max(0, Math.min(order.length - 1, toIndex));
  order.splice(from, 1);
  order.splice(to, 0, id);
  return { ...arrangement, order };
}

export function toggleHidden(arrangement: Arrangement, id: string): Arrangement {
  const hidden = arrangement.hidden.includes(id)
    ? arrangement.hidden.filter((other) => other !== id)
    : [...arrangement.hidden, id];
  return { ...arrangement, hidden };
}

export function parseArrangement(raw: string | null): Arrangement {
  if (!raw) return EMPTY_ARRANGEMENT;
  try {
    const value = JSON.parse(raw) as Partial<Arrangement>;
    const strings = (list: unknown) => (Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : []);
    return { order: strings(value.order), hidden: strings(value.hidden) };
  } catch {
    return EMPTY_ARRANGEMENT;
  }
}

/** An arrangement kept on the phone under `key`; null key keeps nothing. */
export function useArrangement(key: string | null): [Arrangement, (next: Arrangement) => void] {
  const [arrangement, setArrangement] = useState<Arrangement>(EMPTY_ARRANGEMENT);
  useEffect(() => {
    setArrangement(EMPTY_ARRANGEMENT);
    if (!key) return;
    let live = true;
    AsyncStorage.getItem(key)
      .then((raw) => { if (live) setArrangement(parseArrangement(raw)); })
      .catch(() => {});
    return () => { live = false; };
  }, [key]);
  const save = useCallback((next: Arrangement) => {
    setArrangement(next);
    if (key) AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
  }, [key]);
  return [arrangement, save];
}

/** Home's group areas, arranged per budget. */
export const homeAreasKey = (groupId: number | null | undefined) => (groupId ? `jamvi:home-areas:${groupId}` : null);
/** The quick-action bar, one arrangement for the phone. */
export const QUICK_ACTIONS_KEY = 'jamvi:quick-actions';
/** How many actions the bar holds. */
export const QUICK_ACTION_SLOTS = 4;

// More's "Arrange the quick-action bar" opens the sheet the bar itself owns.
const openers = new Set<() => void>();
export function onOpenQuickActionsArranger(listener: () => void): () => void {
  openers.add(listener);
  return () => { openers.delete(listener); };
}
export function openQuickActionsArranger(): void {
  for (const open of openers) open();
}

// A screen in edit mode puts its Save bar where the quick-action bar sits, so the
// bar steps aside until editing ends ("save button at the bottom", 8 Oct 2026).
let quickBarHidden = false;
const quickBarListeners = new Set<(hidden: boolean) => void>();
export function setQuickBarHidden(hidden: boolean): void {
  if (quickBarHidden === hidden) return;
  quickBarHidden = hidden;
  for (const listener of quickBarListeners) listener(hidden);
}
export function useQuickBarHidden(): boolean {
  const [hidden, setHidden] = useState(quickBarHidden);
  useEffect(() => {
    quickBarListeners.add(setHidden);
    setHidden(quickBarHidden);
    return () => { quickBarListeners.delete(setHidden); };
  }, []);
  return hidden;
}
