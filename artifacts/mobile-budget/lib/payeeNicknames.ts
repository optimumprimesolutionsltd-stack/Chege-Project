/**
 * Names the person gave payees: "SAFARICOM POSTPAID BUNDLES" is "Data bundles"
 * to them, and it should stay that way on every later paste.
 *
 * Kept on the device, per budget, as original name → nickname. A nickname
 * replaces the description an entry is saved with, so the category suggestions
 * that learn from earlier entries learn under the name the person actually uses.
 */
export type NicknameMap = Record<string, string>;

/** "  SAMPLE  Shop " and "sample shop" are one payee. */
export const nicknameKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-KE');

/** Where this budget's nicknames are kept. */
export const nicknameStorageKey = (groupId: number | string | undefined): string =>
  `jamvi:payee-nicknames:${groupId ?? 'none'}`;

/** What was stored, or nothing at all if it is missing or damaged: a bad value must never break a paste. */
export function parseStoredNicknames(raw: string | null | undefined): NicknameMap {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const map: NicknameMap = {};
    for (const [key, nickname] of Object.entries(value as Record<string, unknown>)) {
      if (typeof nickname === 'string' && nickname.trim()) map[key] = nickname.trim();
    }
    return map;
  } catch {
    return {};
  }
}

/** The map with this payee's nickname set, or removed when the nickname is empty or the payee's own name. */
export function withNickname(map: NicknameMap, original: string, nickname: string): NicknameMap {
  const key = nicknameKey(original);
  const next = { ...map };
  const wanted = nickname.trim().replace(/\s+/g, ' ');
  if (!wanted || nicknameKey(wanted) === key) delete next[key];
  else next[key] = wanted;
  return next;
}

/**
 * Lines with each payee shown under its nickname. `original` keeps the name the
 * message gave, so a nickname can be changed or taken back later. Only a payee
 * the message actually named can have one: a generic label like "M-Pesa payment"
 * stands for many different payees, and renaming it would rename them all.
 */
export function applyNicknames<T extends { description: string | null; original?: string; named?: boolean }>(
  lines: readonly T[],
  map: NicknameMap,
): T[] {
  return lines.map((line) => {
    if (!line.description && !line.original) return line;
    const original = line.original ?? line.description ?? '';
    const nickname = line.named === false ? undefined : map[nicknameKey(original)];
    return { ...line, original, description: nickname ?? original };
  });
}

/** Whether this line's payee can be given a nickname. */
export const canNickname = (line: { description: string | null; named?: boolean }): boolean =>
  Boolean(line.description) && line.named !== false;
