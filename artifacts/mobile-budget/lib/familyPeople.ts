import { customFetch, getBudgetCategories } from '@workspace/api-client-react';
import { createInPlaceWithId } from './createStandardCategory';
import { displayName, FAMILY_CATEGORY } from './family';
import { payeeKey, payeeName, type PayeeRules } from './payeeLearning';

/**
 * Family support as the heading, and each person a line under it: "under family
 * support hope it's the parent and subcategories are the people" (10 Oct 2026).
 * Jane's money then sits on Family support > Jane Wanjiru, apart from what goes
 * to the parents or siblings - and a split's rest (components/SplitSheet) lands
 * on her own line.
 */

type Row = { id: number; name: string; parentId: number | null; priority?: number | null };

/** The kind of tier family support sits in when Jamvi makes the heading. */
const FAMILY_PRIORITY = 2;
/** What a Family support that held money itself becomes once it is a heading. */
export const OTHER_FAMILY = 'Other family';

const same = (a: string, b: string) => a.trim().toLocaleLowerCase('en-KE') === b.trim().toLocaleLowerCase('en-KE');

/** A person's own line, as their name reads: "JANE WANJIRU 0712***345" -> "Jane Wanjiru". */
export const personLine = (name: string): string => displayName(payeeKey(payeeName(name.replace(/^Received from\s+/i, ''))));

/**
 * Where a budget's Family support stands, and what making a person's line under
 * it needs. Pure, for tests.
 */
export function familyPlan(rows: readonly Row[], person: string):
  | { kind: 'exists'; name: string }
  | { kind: 'under'; parentId: number; priority: number }
  | { kind: 'new-heading' }
  | { kind: 'convert'; leafId: number; priority: number } {
  const own = rows.find((row) => same(row.name, person));
  if (own) return { kind: 'exists', name: own.name };
  const heading = rows.find((row) => same(row.name, FAMILY_CATEGORY) && row.parentId == null);
  if (!heading) return { kind: 'new-heading' };
  const isHeading = rows.some((row) => row.parentId === heading.id);
  return isHeading
    ? { kind: 'under', parentId: heading.id, priority: heading.priority ?? FAMILY_PRIORITY }
    // Family support held money itself: it becomes "Other family" under a new heading,
    // so nothing is left filed on a heading.
    : { kind: 'convert', leafId: heading.id, priority: heading.priority ?? FAMILY_PRIORITY };
}

const put = (id: number, body: Record<string, unknown>) =>
  customFetch(`/api/budget-categories/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/**
 * The person's own line under Family support, made if missing. Gives back its
 * name, and whether Family support was turned into a heading (its own money then
 * lives on "Other family", and rules that named it should follow).
 */
export async function ensurePersonCategory(name: string): Promise<{ line: string; converted: boolean }> {
  const person = personLine(name);
  const rows = (await getBudgetCategories()) as unknown as Row[];
  const plan = familyPlan(rows, person);
  if (plan.kind === 'exists') return { line: plan.name, converted: false };
  if (plan.kind === 'under') {
    const made = await createInPlaceWithId(person, { kind: 'existing', parentId: plan.parentId, priority: plan.priority });
    return { line: made.name, converted: false };
  }
  if (plan.kind === 'new-heading') {
    const made = await createInPlaceWithId(person, { kind: 'new-heading', parentName: FAMILY_CATEGORY, priority: FAMILY_PRIORITY });
    return { line: made.name, converted: false };
  }
  // Renamed first (its entries go along), then the heading with the person under it,
  // then Other family moved under the heading too.
  await put(plan.leafId, { name: OTHER_FAMILY });
  const made = await createInPlaceWithId(person, { kind: 'new-heading', parentName: FAMILY_CATEGORY, priority: plan.priority });
  const after = (await getBudgetCategories()) as unknown as Row[];
  const heading = after.find((row) => same(row.name, FAMILY_CATEGORY) && row.parentId == null);
  if (heading) await put(plan.leafId, { parentId: heading.id });
  return { line: made.name, converted: true };
}

/** Rules that named Family support itself, once it is a heading: Other family instead. */
export function rulesAfterConversion(rules: PayeeRules): PayeeRules {
  let changed = false;
  const next: PayeeRules = {};
  for (const [key, value] of Object.entries(rules)) {
    if (same(value, FAMILY_CATEGORY)) { next[key] = OTHER_FAMILY; changed = true; } else next[key] = value;
  }
  return changed ? next : rules;
}
