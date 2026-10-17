/**
 * Changing many earlier entries at once: shown one by one first, each with a
 * tick box, so the person decides which ones change.
 *
 * "i need a breakdown of those 18 transactions so i can manually confirm
 * whether to change or stay ... for those 18 transactions each should have a
 * tick box ... this should be the logic going forward" (17 Oct 2026). Every
 * "change them all?" question offers "Show them" and opens app/review-changes,
 * which changes only the ticked ones. All start ticked: unticking is the
 * exception, the way they would have been changed before.
 */

export type ReviewRow = {
  id: number;
  date: string;
  amount: number;
  description: string;
  /** Where it is now, when that helps decide (e.g. "Ujenzi salary"). */
  now?: string;
};

export type ReviewChanges = {
  title: string;
  /** What changing does, in one sentence. */
  message: string;
  rows: ReviewRow[];
  /** The button, for the number ticked: "Change 12 to Ujenzi Distributors". */
  actionLabel: (count: number) => string;
  /** Changes the ticked ones; the screen closes when it resolves. */
  change: (ids: number[]) => Promise<void>;
  /** Leaving with none changed (the "Just this once" of the question). */
  leave?: () => void;
};

let pending: ReviewChanges | null = null;

/** Hands the review to app/review-changes, which is pushed next. */
export function offerReview(review: ReviewChanges): void {
  pending = review;
}

export function currentReview(): ReviewChanges | null {
  return pending;
}

export function endReview(): void {
  pending = null;
}

/** Newest first, as on Money. */
export function reviewOrder(rows: readonly ReviewRow[]): ReviewRow[] {
  return [...rows].sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
}

/** The ticked ones, in the order shown. */
export function tickedIds(rows: readonly ReviewRow[], unticked: ReadonlySet<number>): number[] {
  return rows.filter((row) => !unticked.has(row.id)).map((row) => row.id);
}

/** The ticked total, for the line above the button. */
export function tickedTotal(rows: readonly ReviewRow[], unticked: ReadonlySet<number>): number {
  return rows.reduce((sum, row) => (unticked.has(row.id) ? sum : sum + Math.abs(row.amount)), 0);
}
