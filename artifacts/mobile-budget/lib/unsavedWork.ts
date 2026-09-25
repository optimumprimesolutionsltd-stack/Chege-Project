/**
 * Whether anything on screen has been typed or chosen and not yet saved.
 *
 * Screens that keep a draft report in here, so the update prompt can say that
 * an update restarts the app and that the draft will be there afterwards,
 * instead of leaving somebody to wonder whether tapping Update loses their work.
 */
const active = new Map<string, boolean>();

export function markUnsavedWork(key: string, unsaved: boolean): void {
  if (unsaved) active.set(key, true);
  else active.delete(key);
}

export function hasUnsavedWork(): boolean {
  return active.size > 0;
}
