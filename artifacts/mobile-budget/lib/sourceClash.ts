import { bandFor, ruleSourceFor, sourceRuleKey, withBandRule, withSourceRule, type Band, type PayeeRules } from './payeeLearning';

/**
 * A choice for money in that goes against what Jamvi was told before.
 *
 * "If the user says it's for a business specified but during onboarding he had
 * specified differently, how do we correct this instantly" (10 Oct 2026). The
 * person picks Ujenzi's sales for "Equity Bulk Account", but a rule - or the
 * payments already saved - say it is their Salary. Rather than keep both, Jamvi
 * says so the moment it happens and, with one tap, changes the rule and every
 * earlier payment from that payer (for one kind of payment, only those of its
 * amounts). "Just this once" changes nothing else.
 */

export type EarlierMoneyIn = { id: number; amount: number; date: string; description: string; incomeSourceId: number };

export type Clash = {
  /** What the rule said, when there is one and it differs. */
  keptId: number | null;
  /** What most of the earlier payments are under. */
  earlierId: number | null;
  /** Earlier payments from the same payer, under something else: these move. */
  others: EarlierMoneyIn[];
  /** The kind of payment this is kept by, when it is one (payeeLearning band rules). */
  band: Band | null;
};

export function clashOf(
  entry: { id?: number; description: string; amount: number },
  chosenId: number,
  rules: PayeeRules,
  earlier: readonly EarlierMoneyIn[],
  leaveOut: ReadonlySet<number> = new Set(),
): Clash | null {
  const key = sourceRuleKey(entry.description);
  if (!key) return null;
  const band = bandFor(entry.description, 'in', entry.amount, rules);
  const kept = ruleSourceFor(entry.description, entry.amount, rules);
  const others = earlier.filter((one) =>
    one.id !== entry.id
    && !leaveOut.has(one.id)
    && one.incomeSourceId !== chosenId
    && sourceRuleKey(one.description) === key
    && (!band || (Math.abs(one.amount) >= band.lo && Math.abs(one.amount) <= band.hi)));
  const keptId = kept !== null && kept !== chosenId ? kept : null;
  if (keptId === null && others.length === 0) return null;
  const counts = new Map<number, number>();
  for (const one of others) counts.set(one.incomeSourceId, (counts.get(one.incomeSourceId) ?? 0) + 1);
  const earlierId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { keptId, earlierId, others, band };
}

/** The rule from now on: the band's, when it was one kind of payment, else the payer's. */
export const keptFromNowOn = (rules: PayeeRules, description: string, clash: Clash, chosenId: number): PayeeRules =>
  clash.band ? withBandRule(rules, clash.band, String(chosenId)) : withSourceRule(rules, description, chosenId);

/** The question, in words. */
export function clashText(
  label: string,
  clash: Clash,
  name: (id: number) => string,
  chosenId: number,
  isBusiness: (id: number) => boolean,
): { title: string; message: string } {
  const was = (clash.keptId ?? clash.earlierId)!;
  const count = clash.others.length;
  const earlier = count > 0 ? ` ${count} earlier ${count === 1 ? 'payment is' : 'payments are'} under ${name(was)}.` : '';
  // What the two mean when one is a business: the very confusion this is here to clear up.
  const meaning = isBusiness(chosenId) && !isBusiness(was)
    ? ` ${name(chosenId)} is a business: its sales are kept apart from your own income.`
    : !isBusiness(chosenId) && isBusiness(was)
      ? ` ${name(chosenId)} is your own income, not ${name(was)}'s sales.`
      : '';
  return {
    title: `${label}: ${name(chosenId)} from now on?`,
    message: `Before, Jamvi had ${label} as ${name(was)}.${earlier}${meaning} From now on changes ${count > 0 ? (count === 1 ? 'it' : 'them all') : 'what Jamvi remembers'}; Just this once leaves the rest as they are.`,
  };
}
