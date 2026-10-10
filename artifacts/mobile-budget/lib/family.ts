import { looksLikePerson, payeeKey, payeeName, ruleCategory, type PayeeRules } from './payeeLearning';

/**
 * Your family, asked once (Teach Jamvi): money sent to them is family
 * support - or a move - and never a shop (9 Oct 2026, "also ask for family
 * names"). Each name becomes a payee rule (lib/payeeLearning), kept on the
 * server with the rest (lib/rulesStore), so their M-Pesa is filed by itself.
 *
 * People are only ever matched by a kept rule or their own history, never a
 * similar name (jamvi-category-suggestion-rules) - so the name is the one
 * M-Pesa writes, picked from the person's own payments where possible.
 */

type Row = { id: number; name: string; parentId?: number | null };

/** The family categories money can go under: the subcategories of a family heading, or a family category of its own. */
export function familyCategories(rows: readonly Row[]): string[] {
  const parents = new Set(rows.map((row) => row.parentId).filter((id): id is number => id != null));
  const family = rows.filter((row) => /\bfamily\b/i.test(row.name));
  const leaves: string[] = [];
  for (const one of family) {
    if (parents.has(one.id)) leaves.push(...rows.filter((row) => row.parentId === one.id).map((row) => row.name));
    else leaves.push(one.name);
  }
  return [...new Set(leaves)];
}

/** The category to make when the budget has none: as onboarding names it. */
export const FAMILY_CATEGORY = 'Family support';

/** lib/mpesaImport NOT_SURE_CATEGORY: Jamvi's "no answer yet", which a family answer replaces. */
const NOT_SURE = 'Not sure yet';

/** The family names already kept: person rules filed under one of the family categories. */
export function familyNames(rules: PayeeRules, categories: readonly string[]): Array<{ key: string; category: string }> {
  const family = new Set(categories);
  return Object.entries(rules)
    .filter(([key, value]) => family.has(value) && !key.startsWith('#') && !key.startsWith('src:') && !/\d/.test(key))
    .map(([key, category]) => ({ key, category }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** A kept name as people write it: "jane wanjiku" -> "Jane Wanjiku". */
export const displayName = (key: string): string => key.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase('en-KE'));

/**
 * People the person paid who share their surname, not yet kept: the likeliest
 * relatives, offered with one tap. Only names that read as people.
 */
export function relativesBySurname(descriptions: readonly string[], surname: string | null | undefined, kept: readonly string[]): string[] {
  const family = (surname ?? '').trim().toLocaleLowerCase('en-KE');
  if (!family) return [];
  const known = new Set(kept);
  const found = new Map<string, string>();
  for (const description of descriptions) {
    const name = payeeName(description.replace(/^Received from\s+/i, ''));
    if (!name || !looksLikePerson(name)) continue;
    const key = payeeKey(name);
    if (known.has(key) || found.has(key)) continue;
    if (key.split(' ').includes(family)) found.set(key, name);
  }
  return [...found.values()].slice(0, 8);
}

/** The rules with this person kept under a family category. */
export function withFamily(rules: PayeeRules, name: string, category: string): PayeeRules {
  const key = payeeKey(name);
  return key ? { ...rules, [key]: category } : rules;
}

export function withoutFamily(rules: PayeeRules, key: string): PayeeRules {
  const next = { ...rules };
  delete next[key];
  return next;
}

/**
 * Lines of a review paid to this family member, filed under the category now:
 * checked and remembered, as a Teach Jamvi answer is. What the person already
 * chose, or moved elsewhere, is left alone.
 */
type FamilyChoice = { category: string; auto?: boolean; confirmed?: boolean; remember?: boolean; transferTo?: number | null; otherBudget?: unknown; debt?: unknown };

export function fileFamilyLines<L extends { index: number; direction: 'in' | 'out' | null; description: string | null; payeeNumber?: string | null }, C extends FamilyChoice>(
  lines: readonly L[],
  choices: Record<number, C>,
  name: string,
  category: string,
): Record<number, C> {
  const rule = withFamily({}, name, category);
  const next = { ...choices };
  for (const line of lines) {
    const choice = next[line.index];
    if (!choice || line.direction !== 'out' || !line.description) continue;
    if (choice.transferTo || choice.otherBudget || choice.debt) continue;
    if (choice.auto === false && choice.category && choice.category !== NOT_SURE) continue;
    if (ruleCategory(line.description, rule, line.payeeNumber) !== category) continue;
    next[line.index] = { ...choice, category, auto: false, confirmed: true, remember: true };
  }
  return next;
}
