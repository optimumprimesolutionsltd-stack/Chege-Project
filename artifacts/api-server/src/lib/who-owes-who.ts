/**
 * Who owes who, worked out from the entries linked to each person.
 *
 * The balances on Who owes who are bare figures, moved only when somebody
 * accepts an "update this balance?" offer or types one in - so a budget whose
 * offers were all answered "not now" showed nobody owing anything while its
 * entries said otherwise. This adds the entries up instead, to be offered back.
 *
 * Each entry counts once, as the kind of debt it is:
 *  - borrowed: money in from them          -> you owe them more
 *  - pay-back: money out to them           -> you owe them less
 *  - lend: money out to them               -> they owe you more
 *  - repaid: money in from them            -> they owe you less
 * A debt link (debt_entry_links) says which; failing that the entry's own
 * flags do (a deposit settling a person is them paying you back, a loan out
 * marked isLending is lending, any other payment settling a person is paying
 * them back). Neither balance goes below nothing.
 */
export type DebtEntryRow = {
  type: string;
  amount: number | string;
  isLending?: boolean | null;
  isBorrowing?: boolean | null;
  settlesContributorId?: number | null;
  linkPartyId?: number | null;
  linkKind?: string | null;
};

export type WorkedOut = Map<number, { owedToUs: number; owedByUs: number; entries: number }>;

const round = (value: number) => Math.round(value * 100) / 100;

function kindOf(row: DebtEntryRow): { partyId: number; kind: "borrowed" | "pay-back" | "lend" | "repaid" } | null {
  if (row.linkPartyId != null && ["borrowed", "pay-back", "lend", "repaid"].includes(row.linkKind ?? "")) {
    return { partyId: row.linkPartyId, kind: row.linkKind as "borrowed" | "pay-back" | "lend" | "repaid" };
  }
  if (row.settlesContributorId == null) return null;
  // Money in from a person is them paying you back - unless it was borrowed
  // from them, which you now owe. Counted as a repayment, every borrowing
  // took the lender's balance the wrong way and Who owes who showed nobody.
  if (row.type === "deposit") return { partyId: row.settlesContributorId, kind: row.isBorrowing ? "borrowed" : "repaid" };
  return { partyId: row.settlesContributorId, kind: row.isLending ? "lend" : "pay-back" };
}

export function workOutBalances(rows: readonly DebtEntryRow[]): WorkedOut {
  const totals: WorkedOut = new Map();
  for (const row of rows) {
    const found = kindOf(row);
    if (!found) continue;
    const amount = Number(row.amount) || 0;
    const party = totals.get(found.partyId) ?? { owedToUs: 0, owedByUs: 0, entries: 0 };
    if (found.kind === "borrowed") party.owedByUs += amount;
    else if (found.kind === "pay-back") party.owedByUs -= amount;
    else if (found.kind === "lend") party.owedToUs += amount;
    else party.owedToUs -= amount;
    party.entries += 1;
    totals.set(found.partyId, party);
  }
  for (const [id, party] of totals) {
    totals.set(id, { owedToUs: Math.max(0, round(party.owedToUs)), owedByUs: Math.max(0, round(party.owedByUs)), entries: party.entries });
  }
  return totals;
}
