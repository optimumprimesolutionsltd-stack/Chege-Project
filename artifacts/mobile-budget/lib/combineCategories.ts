import type { PayeeRules } from './payeeLearning';

/**
 * Categories onboarding used to make twice. "Shared bills" sat beside
 * Housing, Utilities and Food, so the same rent was Rent or Rent share and
 * neither said what was left to pay ("rent share and rent are one and the
 * same thing. i do not want two categories", 13 Oct 2026). Onboarding no
 * longer offers it; budgets made before are asked once, on Home, to combine
 * each into the one it repeats (api-server lib/combine-categories).
 *
 * `into` names the categories it can go into, the likeliest first; `under`
 * offers every subcategory of that heading instead, for Bills share, which
 * is no one bill.
 */
const TWINS: ReadonlyArray<{ name: string; into?: readonly string[]; under?: string }> = [
  { name: 'Rent share', into: ['Rent'] },
  { name: 'Shopping share', into: ['Groceries', 'Market shopping', 'Supermarket'] },
  { name: 'Bills share', under: 'Utilities' },
];

export type CategoryRow = { id: number; name: string; parentId?: number | null; isArchived?: boolean | null };
export type TwinToCombine = { from: { id: number; name: string }; into: Array<{ id: number; name: string }> };

const key = (name: string) => name.trim().toLowerCase();

/**
 * The first twin there is somewhere to combine into, and not kept on purpose.
 * One with nothing to go into is never asked: there would be no answer.
 */
export function twinToCombine(categories: readonly CategoryRow[], kept: readonly number[] = []): TwinToCombine | null {
  const live = categories.filter((category) => !category.isArchived);
  const isHeading = (id: number) => live.some((category) => (category.parentId ?? null) === id);
  const leaves = live.filter((category) => !isHeading(category.id));
  const byName = (name: string) => leaves.find((category) => key(category.name) === key(name));
  for (const twin of TWINS) {
    const from = byName(twin.name);
    if (!from || kept.includes(from.id)) continue;
    const heading = twin.under ? live.find((category) => key(category.name) === key(twin.under!) && isHeading(category.id)) : undefined;
    const into = (twin.into
      ? twin.into.map(byName).filter((category): category is CategoryRow => category != null)
      : heading ? leaves.filter((category) => category.parentId === heading.id) : [])
      .filter((category) => category.id !== from.id)
      .map((category) => ({ id: category.id, name: category.name }));
    if (into.length > 0) return { from: { id: from.id, name: from.name }, into };
  }
  return null;
}

/** Payees filed under the combined category now go to the one kept (the server does the same to its copy). */
export function withCategoryMoved(rules: PayeeRules, from: string, into: string): PayeeRules {
  const next: PayeeRules = { ...rules };
  for (const [ruleKey, value] of Object.entries(rules)) {
    if (!ruleKey.startsWith('src:') && value === from) next[ruleKey] = into;
  }
  return next;
}

export const keptTwinsKey = (groupId: number | string | undefined) => `jamvi:kept-twin-categories:${groupId ?? 'none'}`;
