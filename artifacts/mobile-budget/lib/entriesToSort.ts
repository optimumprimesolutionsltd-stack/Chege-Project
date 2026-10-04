import { destinationOf, isRecordable, NOT_SURE_CATEGORY, reviewStatus, type Choice, type PreviewLine } from './mpesaImport';
import { payeeKey } from './payeeLearning';

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
export { NOT_SURE_CATEGORY };

export type EntryToSort = {
  id: number;
  type: string;
  direction: 'in' | 'out';
  amount: number;
  date: string;
  description: string;
};

export const isNotSure = (category: string | null | undefined): boolean =>
  (category ?? '').trim().toLowerCase() === NOT_SURE_CATEGORY.toLowerCase();

/** Whether this save needs the "Not sure yet" category made first. */
export function needsNotSureCategory(lines: readonly PreviewLine[], choices: Record<number, Choice>, categoryNames: readonly string[]): boolean {
  if (categoryNames.some(isNotSure)) return false;
  return lines.some((line) => {
    const choice = choices[line.index];
    return Boolean(choice?.include) && line.direction === 'out' && destinationOf(choice) === 'category' && isNotSure(choice?.category);
  });
}

/**
 * Money in just saved with no income source - left on "Not sure yet" - to be
 * marked for sorting out. Not a debt, a member's contribution, a move, savings
 * or another budget's, which need no source; not Fuliza or a reversal.
 *
 * Whether or not the budget has any income sources yet: it used to need one,
 * so in a budget with none, money in was never asked about at all and the
 * income picture stayed empty though the balance was right (4 Oct 2026). One
 * can now be added from the line itself, or from Sort them out.
 */
export function toMarkAfterSave(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
  savedIds: ReadonlyMap<number, number>,
): number[] {
  const ids: number[] = [];
  for (const line of lines) {
    const id = savedIds.get(line.index);
    const choice = choices[line.index];
    if (id === undefined || !choice || line.direction !== 'in') continue;
    if (destinationOf(choice) !== 'category' || choice.debt || choice.contributorId || choice.incomeSourceId != null) continue;
    if (line.type?.startsWith('fuliza_') || line.type === 'reversal') continue;
    ids.push(id);
  }
  return ids;
}

/**
 * Lines "Put them all under Not sure" changes: ticked, still Jamvi's
 * suggestion or still needing a choice, going to a category. Anything the
 * person set themselves - a category, a debt, a move, a contribution,
 * another budget - is left as they set it, and so are Fuliza, charges and
 * reversals, which have places of their own.
 */
export function notSureableLines(lines: readonly PreviewLine[], choices: Record<number, Choice>): PreviewLine[] {
  return lines.filter((line) => {
    const choice = choices[line.index];
    if (!choice?.include || !isRecordable(line)) return false;
    if (line.type?.startsWith('fuliza_') || line.type === 'transaction_charge' || line.type === 'reversal') return false;
    if (destinationOf(choice) !== 'category' || choice.debt || choice.contributorId) return false;
    return reviewStatus(line, choice) !== 'changed';
  });
}

/**
 * Puts each of `lines` under Not sure, confirmed, so a long statement can be
 * saved in one go and sorted out slowly from Sort them out: money out to
 * "Not sure yet", money in with no income source. Nothing is remembered.
 */
export function putUnderNotSure(lines: readonly PreviewLine[], choices: Record<number, Choice>): Record<number, Choice> {
  const next = { ...choices };
  for (const line of lines) {
    const current = next[line.index];
    next[line.index] = line.direction === 'out'
      ? { ...current, category: NOT_SURE_CATEGORY, auto: false, confirmed: true, remember: false }
      : { ...current, incomeSourceId: null, sourceAuto: false, confirmed: true, remember: false };
  }
  return next;
}

/**
 * Money in sent to another budget (a chama, say) with its income source left
 * on "Not sure": marked in that budget, so its own Home brings them back.
 * Grouped by budget, each its own request.
 */
export function otherBudgetToMark(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
  made: ReadonlyMap<number, { groupId: number; id: number }>,
): Map<number, number[]> {
  const byBudget = new Map<number, number[]>();
  for (const line of lines) {
    const entry = made.get(line.index);
    const target = choices[line.index]?.otherBudget;
    if (!entry || !target || line.direction !== 'in' || target.incomeSourceId != null) continue;
    byBudget.set(entry.groupId, [...(byBudget.get(entry.groupId) ?? []), entry.id]);
  }
  return byBudget;
}

/** "3 entries to sort out" - the words for Home. */
export const toSortTitle = (count: number): string => `${count} ${count === 1 ? 'entry' : 'entries'} to sort out`;

/**
 * The other entries still to sort from the same payer, the same way (in or
 * out): a year saved at once holds the same few names many times over, and
 * "Victor Akwir" should be sorted once, not fifty times.
 */
export function sameParty(entries: readonly EntryToSort[], entry: EntryToSort): EntryToSort[] {
  const key = payeeKey(entry.description);
  if (!key) return [];
  return entries.filter((other) => other.id !== entry.id && other.direction === entry.direction && payeeKey(other.description) === key);
}
