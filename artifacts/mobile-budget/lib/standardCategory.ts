import { knownPayeeNames, knownPayeeOf } from './knownPayees';
import { categoryPriority, ONBOARDING_SUBCATEGORIES } from './onboarding';

/**
 * A category the budget does not have yet, for a payee Jamvi knows: the
 * subcategory from the standard tree onboarding uses, the heading it sits
 * under, and that heading's tier. "Naivas" with no Groceries category becomes
 * Food > Groceries in Essentials, never a lone category with no parent or tier
 * (7 Oct 2026).
 */
export type StandardTarget = { key: string; name: string; parent: string; priority: number };

const PARENT_OF = new Map<string, string>(
  Object.entries(ONBOARDING_SUBCATEGORIES).flatMap(([parent, children]) => children.map((child) => [child.toLocaleLowerCase('en-KE'), parent] as [string, string])),
);
const lower = (name: string) => name.trim().toLocaleLowerCase('en-KE');

/**
 * The common category for a payee Jamvi knows (lib/knownPayees): the one it
 * names, under its heading, in that heading's standard tier.
 */
export function standardTargetFor(description: string): StandardTarget | null {
  const known = knownPayeeOf(description);
  if (known?.standard) {
    const { name, parent } = known.standard;
    return { key: known.key, name, parent, priority: categoryPriority(parent) };
  }
  for (const name of knownPayeeNames(description)) {
    const parent = PARENT_OF.get(lower(name));
    if (parent) {
      const child = ONBOARDING_SUBCATEGORIES[parent].find((entry) => lower(entry) === lower(name)) ?? name;
      return { key: known?.key ?? lower(child), name: child, parent, priority: categoryPriority(parent) };
    }
  }
  return null;
}

export type CategoryLite = { id: number; name: string; parentId: number | null; priority?: number | null };

/**
 * Where a new subcategory goes in this budget:
 * - under the person's own heading of that name, in that heading's tier;
 * - or a new heading of that name, in its standard tier, when there is none;
 * - or nowhere yet (`ask`) when a category of that name exists but is not a
 *   heading: nesting under it would make it one, and what was filed under it
 *   would then sit under a heading. The person chooses the parent instead.
 */
export type Placement =
  | { kind: 'existing'; parentId: number; parentName: string; priority: number }
  | { kind: 'new-heading'; parentName: string; priority: number }
  | { kind: 'ask' };

export function placementFor(parentName: string, standardPriority: number, rows: readonly CategoryLite[]): Placement {
  const match = rows.find((row) => lower(row.name) === lower(parentName));
  if (!match) return { kind: 'new-heading', parentName, priority: standardPriority };
  const isHeading = rows.some((row) => row.parentId === match.id);
  if (!isHeading || match.parentId !== null) return { kind: 'ask' };
  return { kind: 'existing', parentId: match.id, parentName: match.name, priority: match.priority ?? standardPriority };
}

/** The headings a person can choose as the parent instead: top-level categories that already have subcategories. */
export function headingsOf(rows: readonly CategoryLite[]): CategoryLite[] {
  return rows.filter((row) => row.parentId === null && rows.some((child) => child.parentId === row.id));
}

/** Whether the budget already has a category of this name. */
export const hasCategory = (name: string, rows: readonly CategoryLite[]): boolean => rows.some((row) => lower(row.name) === lower(name));
