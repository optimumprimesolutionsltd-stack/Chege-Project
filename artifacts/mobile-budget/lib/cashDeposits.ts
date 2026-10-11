import type { Choice, PreviewLine } from './mpesaImport';

/**
 * Cash and M-Pesa are both the person's own money, so moving between them is
 * neither income nor spending - a move to or from their Cash account (built
 * into every budget, api-server lib/default-account):
 *
 * - Cash put on M-Pesa at an agent: from Cash into M-Pesa. Left for the person
 *   to record by hand it was never saved, and Home asked for the same payments
 *   for ever ("still showing 22 messages", 11 Oct 2026).
 * - Cash taken out at an agent: from M-Pesa into Cash ("yes", 11 Oct 2026, to
 *   treating withdrawals the same way). What the cash is then spent on is
 *   recorded from Cash; the withdrawal charge is still a cost (moveFee).
 *
 * With no Cash account a line stays as it was, to be sorted out like any other.
 */
const CASH_MOVES: Record<string, 'in' | 'out'> = { cash_deposit: 'in', cash_withdrawal: 'out' };

export function withCashDeposits(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
  accounts: ReadonlyArray<{ id: number; name: string }>,
): Record<number, Choice> {
  const cash = accounts.find((account) => /\bcash\b/i.test(account.name));
  if (!cash) return choices;
  let next = choices;
  for (const line of lines) {
    const choice = next[line.index];
    const direction = line.type ? CASH_MOVES[line.type] : undefined;
    if (!direction || line.direction !== direction || !choice?.include || choice.transferTo) continue;
    if (next === choices) next = { ...choices };
    next[line.index] = { ...choice, transferTo: cash.id, incomeSourceId: null, sourceAuto: false, debt: null, confirmed: true };
  }
  return next;
}
