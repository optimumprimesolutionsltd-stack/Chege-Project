import type { Choice, PreviewLine } from './mpesaImport';

/** A person or institution in "Who owes who", with what stands between you. */
export type PartyLite = { id: number; name: string; owedToUs?: number | null; owedByUs?: number | null };

/** A budget category that tracks a debt being paid down. */
export type DebtCategoryLite = { id: number; name: string; debtBalance?: number | null };

/**
 * What a payment to, or from, a person means for a debt:
 * - pay-back: you paid back what you owe them (money out, filed under a category)
 * - lend: you lent them money (money out, no category: it is not a cost)
 * - repaid: they paid back what they owe you (money in)
 * - borrowed: you borrowed from them (money in, not income)
 * The same four the day of banking offers, saved the same way.
 */
export type DebtKind = 'pay-back' | 'lend' | 'repaid' | 'borrowed';
export type DebtLink = { kind: DebtKind; partyId: number };

export const DEBT_LABEL: Record<DebtKind, string> = {
  'pay-back': 'Paying back what I owe them',
  lend: 'Lending to them',
  repaid: 'They are paying me back',
  borrowed: 'I borrowed this from them',
};

export const debtKindsFor = (direction: 'out' | 'in'): DebtKind[] =>
  direction === 'out' ? ['pay-back', 'lend'] : ['repaid', 'borrowed'];

/** Only a payment to or from a person can be a debt or a loan. */
export const canLinkDebt = (line: PreviewLine): boolean =>
  line.status === 'ready' && (line.type === 'person_payment' || line.type === 'person_receipt');

const clean = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-KE');
const words = (value: string) => clean(value).split(' ').filter((word) => word.length > 1);

/**
 * The person in Who owes who this payee probably is: the same name, or a name
 * whose every word is in the payee's ("Jeremiah" in "JEREMIAH CHEGE"). The most
 * specific match wins, and two equally good ones mean no match at all, because
 * offering the wrong person is worse than offering none.
 */
export function matchParty(payee: string | null, parties: readonly PartyLite[]): PartyLite | null {
  if (!payee) return null;
  const payeeWords = new Set(words(payee));
  let best: PartyLite | null = null;
  let bestScore = 0;
  let tied = false;
  for (const party of parties) {
    const partyWords = words(party.name);
    if (partyWords.length === 0) continue;
    const exact = clean(party.name) === clean(payee);
    const contained = partyWords.every((word) => payeeWords.has(word));
    if (!exact && !contained) continue;
    const score = exact ? 1000 : partyWords.length;
    if (score > bestScore) {
      best = party;
      bestScore = score;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/** What is most likely meant, when the person's own balance says so; null when it does not. */
export function suggestDebtKind(direction: 'out' | 'in', party: PartyLite): DebtKind | null {
  if (direction === 'out' && (party.owedByUs ?? 0) > 0) return 'pay-back';
  if (direction === 'in' && (party.owedToUs ?? 0) > 0) return 'repaid';
  return null;
}

export type BalanceChange = {
  /** What is shown when asking. */
  label: string;
  endpoint: string;
  method: 'PATCH' | 'PUT';
  body: Record<string, number>;
};

const money = (value: number) => value.toLocaleString('en-KE', { maximumFractionDigits: 2 });
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The balance changes to offer once everything is saved, one per person or
 * debt however many lines touched it, worked out in the order the lines were
 * saved.
 *
 * Offered, never applied: the postings can be edited or deleted afterwards, and
 * a balance moved by itself would be left quietly wrong. Same rule as the day of
 * banking.
 */
export function balanceChanges(
  lines: readonly PreviewLine[],
  choices: Record<number, Choice>,
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

  for (const line of lines) {
    const choice = choices[line.index];
    if (!choice?.include || line.amount === null || line.status !== 'ready') continue;
    const amount = line.amount;
    const link = choice.debt;
    const party = link ? parties.find((candidate) => candidate.id === link.partyId) : undefined;

    if (link && party) {
      if (link.kind === 'pay-back') change(owedByUs, party.id, party.owedByUs ?? 0, (value) => value - amount);
      else if (link.kind === 'borrowed') change(owedByUs, party.id, party.owedByUs ?? 0, (value) => value + amount);
      else if (link.kind === 'repaid') change(owedToUs, party.id, party.owedToUs ?? 0, (value) => value - amount);
      else if (link.kind === 'lend') change(owedToUs, party.id, party.owedToUs ?? 0, (value) => value + amount);
      continue;
    }

    // A payment filed under a category that tracks a debt pays that debt down.
    if (line.direction === 'out' && choice.category) {
      const debt = debtCategories.find(
        (candidate) => clean(candidate.name) === clean(choice.category) && (candidate.debtBalance ?? 0) > 0,
      );
      if (debt) change(debts, debt.id, debt.debtBalance ?? 0, (value) => value - amount);
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
