import { customFetch } from '@workspace/api-client-react';
import type { DifferenceSpan } from './mpesaLiveBalance';

/**
 * Payments M-Pesa has that this budget does not, but another of the person's
 * budgets does - a shared group, a business. They are accounted for there: the
 * import leaves such a code unticked so it is not counted twice, so asking for
 * them here, again and again, never cleared Home ("check again. there are
 * messages still left", 11 Oct 2026).
 *
 * Asked of /api/possible-duplicates/elsewhere, the route that knows who is
 * asking; the M-Pesa import routes never read who is asking.
 */
type Lookup = (receipts: string[]) => Promise<Array<{ receipt: string; budget: string }>>;

const BATCH = 2_000;

export const lookupOtherBudgets: Lookup = async (receipts) => {
  const body = await customFetch<{ elsewhere: Array<{ receipt: string; budget: string }> }>('/api/possible-duplicates/elsewhere', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receipts }),
  });
  return body?.elsewhere ?? [];
};

/** The answer with each missing payment that another budget has marked as saved there. */
export async function withOtherBudgets<A extends { result: { spans: DifferenceSpan[] } | null }>(answer: A, lookup: Lookup = lookupOtherBudgets): Promise<A> {
  if (!answer.result) return answer;
  const codes = [...new Set(answer.result.spans.flatMap((span) => span.missing.filter((item) => !item.savedIn).map((item) => item.receipt)))];
  if (codes.length === 0) return answer;
  const found = new Map<string, string>();
  try {
    for (let at = 0; at < codes.length; at += BATCH) {
      for (const row of await lookup(codes.slice(at, at + BATCH))) found.set(row.receipt, row.budget);
    }
  } catch {
    // Only a refinement: without it the payments are asked for as before.
    return answer;
  }
  if (found.size === 0) return answer;
  const spans = answer.result.spans.map((span) => ({
    ...span,
    missing: span.missing.map((item) => (found.has(item.receipt) && !item.savedIn
      ? { ...item, savedIn: found.get(item.receipt)!, otherBudget: true }
      : item)),
  }));
  return { ...answer, result: { ...answer.result, spans } };
}
