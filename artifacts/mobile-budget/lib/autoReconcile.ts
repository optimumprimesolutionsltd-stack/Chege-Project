import { customFetch } from '@workspace/api-client-react';
import { canReadSms, readMpesaRows } from './mpesaSms';
import { dayBefore } from './bankPeriod';
import {
  differenceMessages,
  fixPlan,
  hasFixes,
  inWorkingYear,
  openingBalanceFix,
  receiptOf,
  statedCharge,
  workingYear,
  type DifferenceSpan,
} from './mpesaLiveBalance';

/**
 * Find the difference, by itself.
 *
 * "I still do not find use for Find the difference. It needs to resolve itself
 * 100 percent and be clean, otherwise a user is troubled" (10 Oct 2026). So the
 * same check (api-server lib/mpesa-difference) runs quietly from Home: this
 * year's M-Pesa messages - only each one's code, balance and time leave the
 * phone - laid against the M-Pesa account, and everything with one sure answer
 * is fixed with no question:
 * - the starting balance M-Pesa held before Jamvi's records begin;
 * - payments saved to another of the person's accounts, moved to M-Pesa;
 * - entries saved under the wrong day, given their message's day;
 * - M-Pesa charges never saved, as each message states them.
 * What only the person can say is all that is left, and Home's Waiting for you
 * says it in a line: entries no message has (typed by hand, or saved twice),
 * and payments no entry has yet (brought in as Not sure yet with one tap).
 */

import type { Leftover } from './reconcileLeftover';
import { leftoverOf } from './reconcileLeftover';
export type { Leftover };

type Answer = {
  account: { id: number; name: string; openingBalance: number };
  result: { from: string; startGap: number; spans: DifferenceSpan[]; moreSpans?: number } | null;
};

/** Every so often, not on every visit to Home: the check reads a year of messages. */
export const RECONCILE_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Rounds of fix-and-check before giving up. The server lists 60 places at a
 * time (api-server lib/mpesa-difference MAX_SPANS), so a long history needs
 * several: one round fixed the first 60 and stopped, and Home went on saying
 * there was more to do ("Find the difference is not finishing", 10 Oct 2026).
 */
export const MAX_ROUNDS = 10;

/** The sure fixes a check found, as one string: the same twice means the last round changed nothing. */
const fixesOf = (opening: number | null, plan: ReturnType<typeof fixPlan>): string =>
  JSON.stringify([opening, plan.move, plan.redate, plan.charges]);

export async function reconcileQuietly(now = Date.now()): Promise<Leftover | null> {
  if (!canReadSms()) return null;
  const { from: yearFrom, days } = workingYear(now);
  const read = await readMpesaRows(days, now);
  if (!read.ok) return null;
  const rows = inWorkingYear(read.rows, yearFrom);
  const messages = differenceMessages(rows);
  if (messages.length === 0) return null;
  const charges = new Map<string, number>();
  for (const row of rows) {
    const code = receiptOf(row.body);
    const stated = code ? statedCharge(row.body) : null;
    if (code && stated !== null && !charges.has(code)) charges.set(code, stated);
  }
  const ask = () => customFetch<Answer>('/api/mpesa/difference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  return fixUntilDone(ask, {
    setOpening: (accountId, openingBalance, from) => customFetch('/api/joint-account/opening-balance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, openingBalance, openingBalanceDate: dayBefore(from) }),
    }),
    fix: (plan) => customFetch('/api/mpesa/difference/fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ move: plan.move, redate: plan.redate, charges: plan.charges }),
    }),
    chargeOf: (receipt) => charges.get(receipt) ?? null,
  });
}

/**
 * Check, make every sure fix, check again - until a check finds none, or a round
 * changes nothing (the same fixes found twice), or MAX_ROUNDS. What is left is
 * only what needs the person.
 */
export async function fixUntilDone(
  ask: () => Promise<Answer>,
  apply: {
    setOpening: (accountId: number, openingBalance: number, from: string) => Promise<unknown>;
    fix: (plan: ReturnType<typeof fixPlan>) => Promise<unknown>;
    chargeOf: (receipt: string) => number | null;
  },
): Promise<Leftover> {
  let answer = await ask();
  let last: string | null = null;
  for (let round = 0; round < MAX_ROUNDS && answer.result; round += 1) {
    const opening = openingBalanceFix(answer.result.startGap, answer.account.openingBalance);
    const plan = fixPlan(answer.result.spans, apply.chargeOf);
    const sure = plan.move.length > 0 || plan.redate.length > 0 || plan.charges.length > 0;
    if (opening === null && !sure) break;
    const these = fixesOf(opening, plan);
    if (these === last) break;
    last = these;
    if (opening !== null) await apply.setOpening(answer.account.id, opening, answer.result.from);
    if (sure) await apply.fix(plan);
    answer = await ask();
  }
  if (!answer.result) return { extra: 0, missing: null };
  return leftoverOf(answer.result.spans, answer.result.moreSpans ?? 0);
}

export { leftoverOf, leftoverText, needsYou } from './reconcileLeftover';
export { hasFixes };
