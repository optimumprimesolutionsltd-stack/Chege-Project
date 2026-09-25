/**
 * What Jamvi learns about where a payee"s payments go, so the next one is filled in.
 *
 * Everything here works from the person"s own books and the rules they chose to
 * keep: nothing is built in, and nothing is ever decided for them. A suggestion is
 * only a suggestion, marked as Jamvi"s, and only a category that exists in the budget
 * is ever offered.
 *
 * In the order they are tried:
 *  1. a rule the person asked to keep for this payee;
 *  2. the category this exact payee was filed under most often (in mpesaImport);
 *  3. a payee sharing most of its name with ones already filed, so "Sample Hotel
 *     Kisumu" is filed like "Sample Hotel Nakuru";
 *  4. a word in the name that has almost always meant one category, so a hotel never
 *     paid before is filed like the hotels that were.
 */
export type PayeeRules = Record<string, string>;

type Past = { type: string; description: string; expenseCategory?: string | null };

const clean = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-KE");

// Words that name no one in particular, so sharing them says nothing about who a payee is.
const FILLER = new Set([
  "the", "and", "ltd", "limited", "co", "company", "of", "kenya", "enterprises", "enterprise", "services", "service",
  "sons", "for", "pay", "bill", "online", "payment", "paybill", "till", "mpesa", "safaricom", "account", "acc",
]);

/** The payee without its account reference: "Sample Utility (42)" is "Sample Utility". */
export const payeeName = (description: string): string => description.replace(/\s*\([^)]*\)\s*$/, "").trim();

/** What a rule is filed under: the payee"s name, tidied, without any account reference. */
export const payeeKey = (description: string): string => clean(payeeName(description));

/** The words that tell one payee from another. */
export function distinctiveWords(description: string): string[] {
  const words = clean(payeeName(description))
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !/^\d+$/.test(word) && !FILLER.has(word));
  return [...new Set(words)];
}

const spending = (history: readonly Past[]) => history.filter((posting) => posting.type === "disbursement" && posting.expenseCategory && posting.description);

const exists = (category: string, categoryNames: readonly string[]) => categoryNames.length === 0 || categoryNames.includes(category);

/** The category the person asked to keep for this payee, or "". */
export function ruleCategory(description: string, rules: PayeeRules): string {
  const key = payeeKey(description);
  return key ? rules[key] ?? "" : "";
}

/**
 * A category used for payees that share most of their name with this one. Needs a
 * clear winner: two categories that tie mean no suggestion, since offering the
 * wrong one is worse than offering none.
 */
export function fuzzyCategory(description: string, history: readonly Past[], categoryNames: readonly string[] = []): string {
  const mine = distinctiveWords(description);
  if (mine.length === 0) return "";
  const score = new Map<string, number>();
  for (const posting of spending(history)) {
    const theirs = distinctiveWords(posting.description);
    if (theirs.length === 0) continue;
    const shared = mine.filter((word) => theirs.includes(word)).length;
    const smaller = Math.min(mine.length, theirs.length);
    // Two shared words, or the whole of a one-word name; and most of the smaller name.
    const enough = shared >= 2 || (shared === 1 && smaller === 1 && mine[0].length >= 4);
    if (!enough || shared / smaller < 0.6) continue;
    const category = posting.expenseCategory as string;
    score.set(category, (score.get(category) ?? 0) + shared / smaller);
  }
  return winner(score, categoryNames);
}

/**
 * A word in the name that has nearly always meant one category in this person"s own
 * books ("hotel" -> Travel). It must have been seen on at least two payees, and one
 * category must own most of them.
 */
export function wordCategory(description: string, history: readonly Past[], categoryNames: readonly string[] = []): string {
  const mine = distinctiveWords(description);
  if (mine.length === 0) return "";
  const byWord = new Map<string, Map<string, Set<string>>>();
  for (const posting of spending(history)) {
    const payee = payeeKey(posting.description);
    for (const word of distinctiveWords(posting.description)) {
      const categories = byWord.get(word) ?? new Map<string, Set<string>>();
      const payees = categories.get(posting.expenseCategory as string) ?? new Set<string>();
      payees.add(payee);
      categories.set(posting.expenseCategory as string, payees);
      byWord.set(word, categories);
    }
  }
  const score = new Map<string, number>();
  for (const word of mine) {
    const categories = byWord.get(word);
    if (!categories) continue;
    let total = 0;
    let top = 0;
    let topCategory = "";
    for (const [category, payees] of categories) {
      total += payees.size;
      if (payees.size > top) {
        top = payees.size;
        topCategory = category;
      }
    }
    // Seen on at least two payees, and one category is nearly all of them.
    if (total < 2 || top / total < 0.75) continue;
    score.set(topCategory, (score.get(topCategory) ?? 0) + top / total + top / 100);
  }
  return winner(score, categoryNames);
}

function winner(score: Map<string, number>, categoryNames: readonly string[]): string {
  const ranked = [...score.entries()].filter(([category]) => exists(category, categoryNames)).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return "";
  if (ranked.length > 1 && ranked[0][1] - ranked[1][1] < 0.15) return "";
  return ranked[0][0];
}

/** Keeps a rule for a payee. */
export function withRule(rules: PayeeRules, description: string, category: string): PayeeRules {
  const key = payeeKey(description);
  if (!key || !category.trim()) return rules;
  return { ...rules, [key]: category.trim() };
}

/** Forgets a rule. */
export function withoutRule(rules: PayeeRules, key: string): PayeeRules {
  const next = { ...rules };
  delete next[key];
  return next;
}

export const rulesStorageKey = (groupId: number | string | undefined): string => `jamvi:payee-rules:${groupId ?? "none"}`;

/** What was stored, or nothing when it is missing or damaged. */
export function parseStoredRules(raw: string | null | undefined): PayeeRules {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([key, value]) => key && typeof value === "string" && value)) as PayeeRules;
  } catch {
    return {};
  }
}
