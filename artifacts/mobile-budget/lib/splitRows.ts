/**
 * A split payment as one entry on Bank: "its 10,000 is not split but the
 * category is the one that is split" (13 Oct 2026).
 *
 * Done here, on the list every screen already shares, not by asking the server
 * for a list of Bank's own: that one was nobody else's, so after a save Bank
 * loaded the whole history again before it showed anything ("amount is not
 * reflecting quickly in banking tab", 15 Oct 2026). Each part carries splitOf,
 * its payment's id (api-server routes/joint-account). The payment shows its
 * whole amount, each category's share in splitParts (its own first), where
 * the newest of them sits, with that one's running balance. A part whose
 * payment is not in the list is shown as it is.
 */

export type SplitPart = { id: number; category: string | null; amount: number };

type Row = {
  id: number;
  amount: number | string;
  expenseCategory?: string | null;
  runningBalance?: number | null;
  splitOf?: number | null;
  splitParts?: SplitPart[];
};

const cents = (value: number | string) => Math.round(Number(value) * 100);

/** Rows newest first, as Bank lists them. */
export function joinSplitRows<T extends Row>(rows: readonly T[]): T[] {
  if (!rows.some((row) => row.splitOf != null)) return rows as T[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const partsOf = new Map<number, T[]>();
  for (const row of rows) {
    if (row.splitOf != null && byId.has(row.splitOf)) partsOf.set(row.splitOf, [...(partsOf.get(row.splitOf) ?? []), row]);
  }
  const out: T[] = [];
  const done = new Set<number>();
  for (const row of rows) {
    const key = row.splitOf != null && byId.has(row.splitOf) ? row.splitOf : partsOf.has(row.id) ? row.id : null;
    if (key === null) { out.push(row); continue; }
    if (done.has(key)) continue;
    done.add(key);
    const root = byId.get(key)!;
    const members = [root, ...partsOf.get(key)!.slice().sort((a, b) => a.id - b.id)];
    out.push({
      ...root,
      amount: members.reduce((sum, member) => sum + cents(member.amount), 0) / 100,
      // The first of them met is the newest: the balance once all of it was paid.
      runningBalance: row.runningBalance,
      splitParts: members.map((member) => ({ id: member.id, category: member.expenseCategory ?? null, amount: Number(member.amount) })),
    });
  }
  return out;
}
