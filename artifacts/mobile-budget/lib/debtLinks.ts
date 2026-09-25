import type { BalanceChange, DebtCategoryLite, DebtKind, PartyLite } from './mpesaDebts';

/**
 * Which person a debt entry was for, and what kind of debt entry it was, as saved
 * when it came from the M-Pesa import. Read when an entry is deleted, so the
 * balance it moved can be offered back.
 */
export type DebtEntryLink = { transactionId: number; partyId: number; kind: DebtKind };

/** What is needed of a deleted entry to put its balance change back. */
export type DeletedEntry = { id: number; type: string; amount: number; expenseCategory?: string | null };

const money = (value: number) => value.toLocaleString('en-KE', { maximumFractionDigits: 2 });
const round2 = (value: number) => Math.round(value * 100) / 100;
const clean = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-KE');

/**
 * The balance changes that undo what saving these entries moved, one per person or
 * debt however many entries touched it.
 *
 * Offered, never applied, and worded "if you updated it": the balance change was
 * only ever offered when the entry was saved, and may have been declined. Entries
 * saved before links were kept have none and are simply not covered.
 */
export function reversalChanges(
  entries: readonly DeletedEntry[],
  links: readonly DebtEntryLink[],
  parties: readonly PartyLite[],
  debtCategories: readonly DebtCategoryLite[],
): BalanceChange[] {
  type Running = { start: number; now: number };
  const owedByUs = new Map<number, Running>();
  const owedToUs = new Map<number, Running>();
  const debts = new Map<number, Running>();
  const change = (map: Map<number, Running>, id: number, start: number, delta: (value: number) => number) => {
    const running = map.get(id) ?? { start, now: start };
    running.now = Math.max(0, round2(delta(running.now)));
    map.set(id, running);
  };

  for (const entry of entries) {
    const link = links.find((candidate) => candidate.transactionId === entry.id);
    const party = link ? parties.find((candidate) => candidate.id === link.partyId) : undefined;
    if (link && party) {
      // The opposite of what saving it did.
      if (link.kind === 'pay-back') change(owedByUs, party.id, party.owedByUs ?? 0, (value) => value + entry.amount);
      else if (link.kind === 'borrowed') change(owedByUs, party.id, party.owedByUs ?? 0, (value) => value - entry.amount);
      else if (link.kind === 'repaid') change(owedToUs, party.id, party.owedToUs ?? 0, (value) => value + entry.amount);
      else if (link.kind === 'lend') change(owedToUs, party.id, party.owedToUs ?? 0, (value) => value - entry.amount);
      continue;
    }
    // A payment filed under a category that tracks a debt paid that debt down; put it back.
    if (!link && entry.type === 'disbursement' && entry.expenseCategory) {
      const debt = debtCategories.find(
        (candidate) => clean(candidate.name) === clean(entry.expenseCategory as string) && candidate.debtBalance !== null && candidate.debtBalance !== undefined,
      );
      if (debt) change(debts, debt.id, debt.debtBalance ?? 0, (value) => value + entry.amount);
    }
  }

  const changes: BalanceChange[] = [];
  for (const [id, running] of owedByUs) {
    if (running.now === running.start) continue;
    const party = parties.find((candidate) => candidate.id === id)!;
    changes.push({
      label: `${party.name}: you owe ${money(running.start)} → ${money(running.now)}`,
      endpoint: `/api/contributors/${id}`,
      method: 'PATCH',
      body: { owedByUs: running.now },
    });
  }
  for (const [id, running] of owedToUs) {
    if (running.now === running.start) continue;
    const party = parties.find((candidate) => candidate.id === id)!;
    changes.push({
      label: `${party.name}: owes you ${money(running.start)} → ${money(running.now)}`,
      endpoint: `/api/contributors/${id}`,
      method: 'PATCH',
      body: { owedToUs: running.now },
    });
  }
  for (const [id, running] of debts) {
    if (running.now === running.start) continue;
    const debt = debtCategories.find((candidate) => candidate.id === id)!;
    changes.push({
      label: `${debt.name}: ${money(running.start)} → ${money(running.now)}`,
      endpoint: `/api/budget-categories/${id}`,
      method: 'PUT',
      body: { debtBalance: running.now },
    });
  }
  return changes;
}
