/**
 * Sorting an entry out as a debt (api-server lib/sort-as-debt.ts).
 *
 * "I can't see the logic of debt option here... adding debtor/creditor"
 * (6 Oct 2026): Sort them out offered only spending categories and income
 * sources, so money lent, borrowed or paid back could only be filed as
 * spending or income.
 */
import { LENDERS } from './mpesaProducts';

export type DebtKind = 'lend' | 'pay-back' | 'borrowed' | 'repaid';

export type DebtKindOption = { kind: DebtKind; label: string; hint: string; needsPerson: boolean };

/** The two kinds money in, or money out, can be - in the person's words. */
export function debtKindsFor(direction: 'in' | 'out'): DebtKindOption[] {
  return direction === 'out'
    ? [
      { kind: 'lend', label: 'I lent it', hint: 'They owe you now (a debtor)', needsPerson: false },
      { kind: 'pay-back', label: 'I paid back a debt', hint: 'You owed them (a creditor)', needsPerson: true },
    ]
    : [
      { kind: 'borrowed', label: 'I borrowed it', hint: 'You owe them now (a creditor)', needsPerson: false },
      { kind: 'repaid', label: 'They paid me back', hint: 'They owed you (a debtor)', needsPerson: true },
    ];
}

export function debtKindLabel(kind: DebtKind): string {
  return kind === 'lend' ? 'Lent' : kind === 'pay-back' ? 'Debt paid back' : kind === 'borrowed' ? 'Borrowed' : 'Paid back to you';
}

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((word) => word.length > 2);

/**
 * The person the entry's description names, when one of them is named: all
 * of their name's words appear in it ("Alice Mwangi" in "Alice Mwangi
 * 0712…"), or their single-word name does. Nobody when two could be meant.
 */
export function suggestedParty<T extends { id: number; name: string }>(description: string, parties: readonly T[]): T | null {
  const said = new Set(words(description));
  const named = parties.filter((party) => {
    const name = words(party.name);
    return name.length > 0 && name.every((word) => said.has(word));
  });
  return named.length === 1 ? named[0] : null;
}

/**
 * Who the sheet offers. Fuliza, M-Shwari, KCB M-PESA and Hustler Fund are
 * left out: the M-Pesa import links their loans and repayments itself, so
 * picking one by hand for any other entry made a second debt beside the one
 * the import keeps, and their balance in Who owes who came out wrong
 * ("should fuliza be there or not since its automatically picked?", 6 Oct
 * 2026). One is still offered when the entry itself names it.
 */
export function partiesToOffer<T extends { id: number; name: string }>(parties: readonly T[], suggested: T | null): T[] {
  const isLender = (party: T) => LENDERS.some((lender) => lender.party.test(party.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-KE')));
  return parties.filter((party) => !isLender(party) || party.id === suggested?.id);
}
