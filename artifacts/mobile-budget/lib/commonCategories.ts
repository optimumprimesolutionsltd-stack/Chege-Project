import { customFetch, getBudgetCategories } from '@workspace/api-client-react';
import { createInPlaceWithId } from './createStandardCategory';
import { knownPayeeCategory, setStandardLinks } from './knownPayees';
import { isBankPayee, NOT_SURE_CATEGORY } from './mpesaImport';
import { looksLikePerson } from './payeeLearning';
import { placementFor, standardTargetFor, type CategoryLite, type StandardTarget } from './standardCategory';

/**
 * The common categories Jamvi makes for payees it knows.
 *
 * "For KPLC, Naivas etc shouldn't we have such categories like supermarket and
 * utilities embedded that recognize such?" and "all the recognized categories
 * should be as per the app subject to the user changing" (9 Oct 2026). The first
 * time a restaurant is paid Jamvi makes Food > Eating out - or uses the person's
 * own category that fits - and remembers it on the server by id
 * (api-server lib/standard-categories), so renaming or moving it keeps it.
 */

export type StandardLink = { key: string; categoryId: number; name: string };

export async function fetchStandardLinks(): Promise<StandardLink[]> {
  const body = await customFetch<{ links?: StandardLink[] }>('/api/standard-categories', { responseType: 'json' });
  return Array.isArray(body?.links) ? body.links : [];
}

/** The links as lib/knownPayees reads them: key to the category's name now. */
export function applyLinksForMatching(links: readonly StandardLink[]): void {
  setStandardLinks(Object.fromEntries(links.map((link) => [link.key, link.name])));
}

const remember = (key: string, categoryId: number) =>
  customFetch('/api/standard-categories', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, categoryId }),
  }).catch(() => {
    // Not remembered (an older server, or a member who cannot): found by name next time.
  });

const lower = (name: string) => name.trim().toLocaleLowerCase('en-KE');

/**
 * Makes sure each common category exists, and gives back the name each key is
 * saved under: the remembered category, else one of the same name, else a new
 * one in its standard place. A key with nowhere to go - a category with the
 * heading's name that is not a heading - is left out; its entries stay Not sure.
 */
export async function ensureCommonCategories(targets: readonly StandardTarget[]): Promise<Map<string, string>> {
  const made = new Map<string, string>();
  if (targets.length === 0) return made;
  const links = await fetchStandardLinks().catch(() => [] as StandardLink[]);
  let rows = (await getBudgetCategories()) as unknown as CategoryLite[];
  const seen = new Set<string>();
  for (const target of targets) {
    if (seen.has(target.key)) continue;
    seen.add(target.key);
    const linked = links.find((link) => link.key === target.key && rows.some((row) => row.id === link.categoryId));
    if (linked) {
      made.set(target.key, rows.find((row) => row.id === linked.categoryId)!.name);
      continue;
    }
    const sameName = rows.find((row) => lower(row.name) === lower(target.name));
    if (sameName) {
      made.set(target.key, sameName.name);
      await remember(target.key, sameName.id);
      continue;
    }
    const place = placementFor(target.parent, target.priority, rows);
    if (place.kind === 'ask') continue;
    try {
      const created = await createInPlaceWithId(target.name, place.kind === 'existing'
        ? { kind: 'existing', parentId: place.parentId, priority: place.priority }
        : { kind: 'new-heading', parentName: place.parentName, priority: place.priority });
      made.set(target.key, created.name);
      await remember(target.key, created.id);
      // The new heading, if one was made, is there for the next key under it.
      rows = (await getBudgetCategories()) as unknown as CategoryLite[];
    } catch {
      // Left out: its entries stay Not sure, and are tried again next time.
    }
  }
  return made;
}

/**
 * Where an entry to a payee Jamvi knows belongs: the budget's own category that
 * fits (lib/knownPayees), else its common one, which may not exist yet. Null for
 * people and banks, whose payments could be for anything, and payees Jamvi does
 * not know.
 */
export function recognisedPlace(description: string, categoryNames: readonly string[]): { name: string; target: StandardTarget | null } | null {
  if (!description || isBankPayee(description) || looksLikePerson(description)) return null;
  const own = knownPayeeCategory(description, categoryNames);
  if (own && own !== NOT_SURE_CATEGORY) return { name: own, target: null };
  const target = standardTargetFor(description);
  return target ? { name: target.name, target } : null;
}
