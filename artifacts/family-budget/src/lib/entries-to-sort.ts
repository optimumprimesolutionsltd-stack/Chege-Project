import { destinationOf, type Choice, type PreviewLine } from "./mpesa-import";

/**
 * Saving an entry as "Not sure" and sorting it out later.
 *
 * Asked for 2 Oct 2026, importing January to September: an old entry nobody
 * can place should not hold the save up, and should not be forgotten either.
 * - Money out goes to NOT_SURE_CATEGORY, a real category (made the first time
 *   it is needed), so it still counts as spending.
 * - Money in saved with no income source is marked on the server.
 * Home then shows how many are left, and Sort them out takes each in turn
 * (api-server lib/entries-to-sort).
 *
 * Shared with the web (sync-web-twins.py).
 */
export const NOT_SURE_CATEGORY = "Not sure yet";

export type EntryToSort = {
  id: number;
  type: string;
  direction: "in" | "out";
  amount: number;
  date: string;
  description: string;
};

export const isNotSure = (category: string | null | undefined): boolean =>
  (category ?? "").trim().toLowerCase() === NOT_SURE_CATEGORY.toLowerCase();

/** Whether this save needs the "Not sure yet" category made first. */
export function needsNotSureCategory(lines: readonly PreviewLine[], choices: Record<number, Choice>, categoryNames: readonly string[]): boolean {
  if (categoryNames.some(isNotSure)) return false;
  return lines.some((line) => {
    const choice = choices[line.index];
    return Boolean(choice?.include) && line.direction === "out" && destinationOf(choice) === "category" && isNotSure(choice?.category);
  });
}

/**
 * Money in just saved with no income source - left on "Not sure" - to be
 * marked for sorting out. Not a debt, a member"s contribution, a move, savings
 * or another budget"s, which need no source; not Fuliza or a reversal. Only
 * when the budget has income sources to choose from at all.
 */
export function toMarkAfterSave(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
  savedIds: ReadonlyMap<number, number>,
  hasIncomeSources: boolean,
): number[] {
  if (!hasIncomeSources) return [];
  const ids: number[] = [];
  for (const line of lines) {
    const id = savedIds.get(line.index);
    const choice = choices[line.index];
    if (id === undefined || !choice || line.direction !== "in") continue;
    if (destinationOf(choice) !== "category" || choice.debt || choice.contributorId || choice.incomeSourceId != null) continue;
    if (line.type?.startsWith("fuliza_") || line.type === "reversal") continue;
    ids.push(id);
  }
  return ids;
}

/** "3 entries to sort out" - the words for Home. */
export const toSortTitle = (count: number): string => `${count} ${count === 1 ? "entry" : "entries"} to sort out`;
