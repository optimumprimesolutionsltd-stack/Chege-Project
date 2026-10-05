import { type Choice, type PreviewLine } from './mpesaImport';
import { LENDERS, loanOf, type Lender, type LenderId } from './mpesaProducts';

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

/**
 * A payment to or from a person can be a debt or a loan, and so can money to or from
 * a company: a director's own business paying them, or being paid, is the same
 * creditor and debtor logic as a neighbour. Money in from a bank is always asked
 * about. A paybill or till payment is asked about only when it names a bank, or a
 * person or company already in Who owes who, so everyday bills stay uncluttered.
 */
export const canLinkDebt = (line: PreviewLine, _parties: readonly PartyLite[] = []): boolean => {
  if (line.status !== 'ready') return false;
  // Asked for 2 Oct 2026: cash taken out at an agent, a till or a paybill can
  // be a loan or a repayment as much as a payment to a person, and the option
  // vanishing from those read as Jamvi's suggestion removing it. Only what is
  // never a debt stays without it: airtime, Fuliza (its own debt already), an
  // M-Pesa charge and a reversal.
  return !NEVER_A_DEBT.has(line.type ?? '') && !(line.type ?? '').startsWith('fuliza_');
};
const NEVER_A_DEBT = new Set(['airtime_purchase', 'transaction_charge', 'reversal']);

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

/** The name Fuliza goes by in Who owes who. It was "Safaricom PLC" until 5 Oct 2026; the server renames that one. */
export const FULIZA_PARTY_NAME = 'Fuliza';

/** This lender in Who owes who, when it is there. */
export const findLenderParty = (lender: Lender, parties: readonly PartyLite[]): PartyLite | null =>
  parties.find((party) => lender.party.test(clean(party.name))) ?? null;

/** Fuliza in Who owes who, when it is there. */
export const findFulizaParty = (parties: readonly PartyLite[]): PartyLite | null =>
  findLenderParty(LENDERS.find((lender) => lender.id === 'fuliza')!, parties);

/**
 * The lenders - Fuliza, M-Shwari, KCB M-PESA, Hustler Fund - that ticked lines
 * borrow from or pay back and that are not linked to anybody yet: each needs
 * its own entry in Who owes who before the save.
 */
export function lendersNeeded(lines: readonly PreviewLine[], choices: Record<number, Choice>): Lender[] {
  const needed = new Map<LenderId, Lender>();
  for (const line of lines) {
    const loan = loanOf(line);
    const choice = choices[line.index];
    if (loan && choice?.include && !choice.debt) needed.set(loan.lender.id, loan.lender);
  }
  return [...needed.values()];
}

/** Whether any ticked line needs Fuliza in Who owes who. */
export const needsFulizaParty = (lines: readonly PreviewLine[], choices: Record<number, Choice>): boolean =>
  lendersNeeded(lines, choices).some((lender) => lender.id === 'fuliza');

/**
 * A loan still owed is a debt to its lender, and paying it back clears that
 * debt, so each such line is linked to its lender - Who owes who then shows
 * what is owed to each. Lines already linked to somebody are left as they were.
 */
export function withLenderDebts(lines: readonly PreviewLine[], choices: Record<number, Choice>, partyIds: Partial<Record<LenderId, number>>): Record<number, Choice> {
  const next = { ...choices };
  for (const line of lines) {
    const choice = next[line.index];
    const loan = loanOf(line);
    const partyId = loan ? partyIds[loan.lender.id] : undefined;
    if (!choice || choice.debt || !loan || partyId == null) continue;
    if (loan.kind === 'borrowed') next[line.index] = { ...choice, debt: { kind: 'borrowed', partyId }, incomeSourceId: null };
    else next[line.index] = { ...choice, debt: { kind: 'pay-back', partyId }, category: '', auto: false };
  }
  return next;
}

/** Fuliza's lines linked to it (see withLenderDebts). */
export const withFulizaDebt = (lines: readonly PreviewLine[], choices: Record<number, Choice>, partyId: number): Record<number, Choice> =>
  withLenderDebts(lines.filter((line) => line.type?.startsWith('fuliza_')), choices, { fuliza: partyId });
