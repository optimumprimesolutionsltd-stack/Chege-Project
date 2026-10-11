/**
 * A result per piece of text, worked out once and remembered.
 *
 * An import asks the same questions of each line's payee many times over - its
 * name tidied, lower-cased the Kenyan way, split into words, looked at for a
 * person's number. Each answer is quick on a computer and slow on a phone,
 * where text work runs hundreds of times slower: suggestions for 354 lines
 * took 12 s even with no history and no rules (11 Oct 2026). Cleared when it
 * grows past a few statements' worth. Callers must not change what they get.
 */
export function rememberByText<T>(work: (text: string) => T, limit = 20_000): (text: string) => T {
  const seen = new Map<string, T>();
  return (text) => {
    if (seen.has(text)) return seen.get(text) as T;
    if (seen.size > limit) seen.clear();
    const value = work(text);
    seen.set(text, value);
    return value;
  };
}
