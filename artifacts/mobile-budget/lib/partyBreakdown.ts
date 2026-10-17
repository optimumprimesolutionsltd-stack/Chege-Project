import { formatExact } from './formatExact';

/**
 * Where a person's balance on Who owes who comes from (api-server
 * GET /contributors/:id/breakdown): the entries behind it, and what of it no
 * entry explains - "check on who owes who why judys money is 680,100- where
 * isit coming from" (17 Oct 2026).
 */
export type DebtKind = 'borrowed' | 'pay-back' | 'lend' | 'repaid';

export type PartyBreakdown = {
  id: number;
  name: string;
  now: { owedToUs: number; owedByUs: number };
  fromEntries: { owedToUs: number; owedByUs: number };
  notFromEntries: { owedToUs: number; owedByUs: number };
  entries: Array<{
    id: number;
    date: string;
    description: string;
    accountId: number | null;
    amount: number;
    kind: DebtKind;
    owedByUs: number;
    owedToUs: number;
    runningOwedByUs: number;
    runningOwedToUs: number;
  }>;
};

export const KIND_WORDS: Record<DebtKind, string> = {
  borrowed: 'Borrowed from them',
  'pay-back': 'Paid them back',
  lend: 'Lent to them',
  repaid: 'They paid you back',
};

/** The part of the balance no entry explains, in words; null when the entries explain all of it. */
export function breakdownGap(data: PartyBreakdown): string | null {
  const parts: string[] = [];
  const said = (gap: number, owing: string) => {
    if (Math.abs(gap) < 0.01) return;
    parts.push(gap > 0
      ? `KES ${formatExact(gap)} of what ${owing} is not from any entry: it was typed in, or added when an "add to the balance?" offer was accepted.`
      : `What ${owing} is KES ${formatExact(-gap)} less than the entries add up to: some was taken off by hand.`);
  };
  said(data.notFromEntries.owedByUs, `you owe ${data.name}`);
  said(data.notFromEntries.owedToUs, `${data.name} owes you`);
  return parts.length > 0 ? parts.join(' ') : null;
}
