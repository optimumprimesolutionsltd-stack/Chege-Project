import { payeeKey, type PayeeRules } from './payeeLearning';

/**
 * What a person's money covers, said once (api-server lib/transaction-splits).
 *
 * "My wife appears under family support - but money sent to her should be to
 * cover rent or school fees" (10 Oct 2026). Kept with the payee rules, on the
 * server (lib/rulesStore), under "covers:<payee>": each category with its
 * amount a month, filled first by every payment to them, then where the rest
 * goes. Short, so it fits a rule's value.
 */
export const COVERS_PREFIX = 'covers:';

export type CoversPlan = { plan: Array<{ category: string; monthly: number }>; rest: string };

export const coversKey = (description: string): string => {
  const key = payeeKey(description);
  return key ? `${COVERS_PREFIX}${key}` : '';
};

export function formatCovers(covers: CoversPlan): string {
  return JSON.stringify({ p: covers.plan.map((item) => [item.category, Math.round(item.monthly)]), r: covers.rest });
}

export function parseCovers(value: string | undefined): CoversPlan | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(value) as { p?: unknown; r?: unknown };
    if (!Array.isArray(raw.p) || typeof raw.r !== 'string' || !raw.r.trim()) return null;
    const plan = raw.p
      .filter((item): item is [string, number] => Array.isArray(item) && typeof item[0] === 'string' && typeof item[1] === 'number' && item[1] > 0)
      .map(([category, monthly]) => ({ category, monthly }));
    return plan.length > 0 ? { plan, rest: raw.r } : null;
  } catch {
    return null;
  }
}

/** Every person whose money covers something, by payee key. */
export function coversRules(rules: PayeeRules): Array<{ payeeKey: string } & CoversPlan> {
  const found: Array<{ payeeKey: string } & CoversPlan> = [];
  for (const [key, value] of Object.entries(rules)) {
    if (!key.startsWith(COVERS_PREFIX)) continue;
    const covers = parseCovers(value);
    if (covers) found.push({ payeeKey: key.slice(COVERS_PREFIX.length), ...covers });
  }
  return found;
}

/** What this payee's money covers, if it was said. */
export const coversFor = (description: string, rules: PayeeRules): CoversPlan | null => parseCovers(rules[coversKey(description)]);

/** In words: "Rent KES 15,000 and School fees KES 5,000 a month, then Family support". */
export function coversText(covers: CoversPlan): string {
  const parts = covers.plan.map((item) => `${item.category} KES ${Math.round(item.monthly).toLocaleString('en-KE')}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return `${list} a month, then ${covers.rest}`;
}

/** The first day of last month, for the payments a sweep looks at. */
export function sweepSince(now = new Date()): string {
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`;
}
