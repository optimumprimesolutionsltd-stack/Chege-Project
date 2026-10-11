import type { Choice, PreviewLine } from './mpesaImport';

/**
 * Cash put on M-Pesa at an agent is the person's own cash moving: from their
 * Cash account into M-Pesa, neither income nor spending. Left for them to record
 * by hand it was never saved, and Home asked for the same payments for ever
 * ("still showing 22 messages", 11 Oct 2026). With no Cash account it stays
 * money in, to be sorted out like any other.
 */
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
    if (line.type !== 'cash_deposit' || line.direction !== 'in' || !choice?.include || choice.transferTo) continue;
    if (next === choices) next = { ...choices };
    next[line.index] = { ...choice, transferTo: cash.id, incomeSourceId: null, sourceAuto: false, confirmed: true };
  }
  return next;
}
