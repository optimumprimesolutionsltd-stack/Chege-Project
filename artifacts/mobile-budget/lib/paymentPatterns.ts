/**
 * What a payee's many payments have in common, so the person recognises them
 * at a glance and answers once for each kind.
 *
 * "Equity Bulk Account, received 68 times" could be anything: M-Pesa names no
 * account for money a bank pays in. But 12 of about KES 52,000 near the 28th
 * of each month is pay, and 56 of every size at any time is most likely the
 * person's own money moving ("jamvi can check out where there has been
 * multiple payments and suggest what to do ... the user should recognize that
 * immediately", 10 Oct 2026). Each kind is asked about on its own, with what
 * jogs the memory - how often, how much, which day, since when, the last few -
 * and kept by its amounts (payeeLearning band rules), so the same question is
 * never asked again.
 *
 * No imports: the web has the same file under the same name (sync-web-twins).
 */

export type Paid = { amount: number; date: string | null };

/**
 * monthly: about the same amount, about once a month, for three months or more.
 * same: exactly the same amount, three times or more, at any time.
 * varied: everything else.
 */
export type PatternKind = 'monthly' | 'same' | 'varied';

export type Pattern = {
  kind: PatternKind;
  /** Positions in the list given. */
  positions: number[];
  /** The amounts it covers, a little wider than seen, for the payments to come. */
  lo: number;
  hi: number;
  /** The middle amount. */
  typical: number;
  /** The day of the month it usually comes, for monthly. */
  day: number | null;
  from: string | null;
  to: string | null;
};

/** Amounts within this much of a group's smallest are the same payment, give or take. */
const CLOSE = 0.15;
/** Fewer than this many is not a pattern. */
const AT_LEAST = 3;

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor((sorted.length - 1) / 2)];
};

function patternOf(kind: PatternKind, items: readonly Paid[], positions: number[], widen: boolean): Pattern {
  const amounts = positions.map((at) => Math.abs(items[at].amount));
  const dates = positions.map((at) => items[at].date).filter((date): date is string => !!date).sort();
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  return {
    kind,
    positions,
    lo: widen ? Math.floor(min * (1 - CLOSE / 2)) : min,
    hi: widen ? Math.ceil(max * (1 + CLOSE / 2)) : max,
    typical: median(amounts),
    day: kind === 'monthly' ? median(dates.map((date) => Number(date.slice(8, 10)))) : null,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  };
}

/**
 * The kinds of payment among `items`: monthly and same-amount groups first,
 * most first, then whatever is left as one varied group. One pattern back
 * means nothing to tell apart.
 */
export function patternsOf(items: readonly Paid[]): Pattern[] {
  if (items.length === 0) return [];
  const order = items.map((_, at) => at).sort((a, b) => Math.abs(items[a].amount) - Math.abs(items[b].amount));
  const clusters: number[][] = [];
  for (const at of order) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(items[at].amount) <= Math.abs(items[last[0]].amount) * (1 + CLOSE)) last.push(at);
    else clusters.push([at]);
  }
  const found: Pattern[] = [];
  const taken = new Set<number>();
  for (const cluster of clusters) {
    if (cluster.length < AT_LEAST) continue;
    const dated = cluster.filter((at) => items[at].date);
    const months = new Set(dated.map((at) => items[at].date!.slice(0, 7))).size;
    const exact = cluster.every((at) => Math.abs(items[at].amount) === Math.abs(items[cluster[0]].amount));
    const kind: PatternKind | null = months >= AT_LEAST && dated.length / months <= 1.5 ? 'monthly' : exact ? 'same' : null;
    if (!kind) continue;
    found.push(patternOf(kind, items, cluster, kind === 'monthly'));
    for (const at of cluster) taken.add(at);
  }
  found.sort((a, b) => b.positions.length - a.positions.length);
  const rest = items.map((_, at) => at).filter((at) => !taken.has(at));
  if (rest.length > 0) found.push(patternOf('varied', items, rest, false));
  return found;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const kes = (value: number) => `KES ${Math.round(value).toLocaleString('en-KE')}`;
const dayOf = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
const ordinal = (day: number) => `${day}${day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th'}`;

function span(from: string | null, to: string | null): string {
  if (!from || !to) return '';
  const month = (date: string) => MONTHS[Number(date.slice(5, 7)) - 1];
  const year = (date: string) => date.slice(0, 4);
  if (from.slice(0, 7) === to.slice(0, 7)) return `${month(to)} ${year(to)}`;
  return year(from) === year(to) ? `${month(from)} – ${month(to)} ${year(to)}` : `${month(from)} ${year(from)} – ${month(to)} ${year(to)}`;
}

/** The pattern in a line: "12 times, about KES 52,000, around the 28th of each month, Mar – Oct 2026". */
export function describePattern(pattern: Pattern, items: readonly Paid[]): string {
  const count = pattern.positions.length;
  const times = `${count} ${count === 1 ? 'time' : 'times'}`;
  const when = span(pattern.from, pattern.to);
  const amounts = pattern.positions.map((at) => Math.abs(items[at].amount));
  const parts = pattern.kind === 'monthly'
    ? [times, `about ${kes(pattern.typical)}`, `around the ${ordinal(pattern.day ?? 1)} of each month`]
    : pattern.kind === 'same'
      ? [times, `${kes(pattern.typical)} each`]
      : [times, count === 1 ? kes(amounts[0]) : `${kes(Math.min(...amounts))} to ${kes(Math.max(...amounts))}`];
  return [...parts, ...(when ? [when] : [])].join(', ');
}

/** The last few, newest first: "Last: 5 Oct KES 3,000 · 28 Sep KES 52,000". */
export function recentOf(pattern: Pattern, items: readonly Paid[], shown = 3): string {
  const recent = pattern.positions
    .filter((at) => items[at].date)
    .sort((a, b) => (items[b].date! < items[a].date! ? -1 : items[b].date! > items[a].date! ? 1 : 0))
    .slice(0, shown)
    .map((at) => `${dayOf(items[at].date!)} ${kes(Math.abs(items[at].amount))}`);
  return recent.length > 0 ? `Last: ${recent.join(' · ')}` : '';
}

/** What the pattern most likely is, in words, to jog the memory. Null when nothing can be said. */
export function patternHint(pattern: Pattern, direction: 'in' | 'out', fromBank: boolean): string | null {
  if (direction === 'in') {
    if (pattern.kind === 'monthly') return 'Every month, about the same: this looks like pay - a salary or other regular income.';
    if (pattern.kind === 'same') return 'The same amount each time: an allowance, rent you collect, or your own money moving?';
    return fromBank ? 'Different amounts at different times: often your own money, moved from your bank to M-Pesa.' : null;
  }
  if (pattern.kind === 'monthly') return 'Every month, about the same: rent, school fees, a loan or a bill?';
  if (pattern.kind === 'same') return 'The same amount each time: a subscription, a contribution, or savings?';
  return fromBank ? 'Different amounts at different times: often your own money, moved from M-Pesa to your bank.' : null;
}
