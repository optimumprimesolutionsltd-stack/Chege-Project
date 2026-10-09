import { and, or, sql, type SQL } from "drizzle-orm";

/**
 * Search by words, not by the exact phrase.
 *
 * "William nyoro" found nothing when M-Pesa wrote "WILLIAM K NYORO 0712..." -
 * the whole phrase was looked for as typed. People want to find somebody
 * "anything in the brief description" (9 Oct 2026): every word typed must be
 * somewhere in the entry, in any order and any field searched.
 */

/** The words of a search, each at most once; no more than six. */
export function searchWords(query: string): string[] {
  const seen = new Set<string>();
  for (const word of query.trim().toLocaleLowerCase("en-KE").split(/\s+/)) {
    if (word) seen.add(word);
  }
  return [...seen].slice(0, 6);
}

/** An ILIKE pattern for one word, with % and _ meant literally. */
export function wordPattern(word: string): string {
  return `%${word.replace(/[\%_]/g, "\$&")}%`;
}

/**
 * True, in SQL, when every word is in at least one of the fields:
 * `fields(pattern)` lists the conditions for one word's pattern.
 */
export function everyWord(words: readonly string[], fields: (pattern: string) => Array<SQL | undefined>): SQL {
  if (words.length === 0) return sql`false`;
  const perWord = words.map((word) => or(...fields(wordPattern(word))) ?? sql`false`);
  return and(...perWord) ?? sql`false`;
}
