/**
 * Editing an expense that was funded from more than one income source.
 *
 * Creating these splits already worked on the web; editing them did not. An
 * expense with several funding portions opened with "Financed by" disabled and
 * a note saying the portions would be preserved. Preserving beats corrupting,
 * but it left a shared-group treasurer who split funding on the phone unable
 * to correct it here - they could fix the description and not the money.
 *
 * The rules live here rather than inside the three-thousand-line page so they
 * can be run directly. They mirror the phone's
 * (mobile-budget/lib/expenseFundingPreservation.ts), which is the shape the
 * API already stores.
 */

export type FundingSplit = {
  userId?: string | null;
  label?: string;
  amount: number;
  incomeSourceId?: number;
  fromBank: boolean;
  accountId?: number;
};

export type StoredSplit = {
  userId?: string | null;
  label?: string;
  amount: number;
  incomeSourceId?: number;
  fromBank: boolean;
  accountId?: number;
};

/**
 * The editable part of a stored expense: its direct (non-bank) portions that
 * name a saved income source.
 *
 * A portion without an incomeSourceId is a historical record from before
 * sources were saved objects. It is deliberately not turned into an editable
 * row - there is nothing to select in the picker that would represent it - and
 * the caller keeps such an expense on the preserve path.
 */
export function directSplitsFrom(splits: readonly StoredSplit[] | undefined | null): {
  sourceIds: number[];
  amounts: Record<string, string>;
  /** True when every non-bank portion could be represented as an editable row. */
  editable: boolean;
} {
  const direct = (splits ?? []).filter((split) => !split.fromBank);
  const withSource = direct.filter(
    (split) => typeof split.incomeSourceId === "number" && Number.isFinite(split.incomeSourceId),
  );
  const amounts: Record<string, string> = {};
  const sourceIds: number[] = [];
  for (const split of withSource) {
    const key = String(split.incomeSourceId);
    // The same source twice is one row carrying the sum; splitting a source
    // against itself is not a distinction anybody made on purpose.
    amounts[key] = String((Number(amounts[key] ?? 0) || 0) + (Number(split.amount) || 0));
    if (!sourceIds.includes(split.incomeSourceId as number)) sourceIds.push(split.incomeSourceId as number);
  }
  return { sourceIds, amounts, editable: direct.length > 0 && withSource.length === direct.length };
}

/** What the chosen portions add up to. */
export function directSplitsTotal(
  sourceIds: readonly number[],
  amounts: Readonly<Record<string, string>>,
): number {
  return sourceIds.reduce((sum, id) => sum + (Number(amounts[String(id)] || 0) || 0), 0);
}

export type DirectSplitProblem =
  | { kind: "none-selected" }
  | { kind: "portion-missing" }
  | { kind: "short"; by: number }
  | { kind: "over"; by: number };

/**
 * Whether the portions can be saved against this expense total.
 *
 * Order matters: an empty portion is reported as an empty portion rather than
 * as a shortfall, because a total computed from a blank box is not a second,
 * separate thing for somebody to go and fix.
 */
export function directSplitProblem({
  total,
  sourceIds,
  amounts,
}: {
  total: number;
  sourceIds: readonly number[];
  amounts: Readonly<Record<string, string>>;
}): DirectSplitProblem | null {
  if (sourceIds.length === 0) return { kind: "none-selected" };
  if (sourceIds.some((id) => (Number(amounts[String(id)] || 0) || 0) <= 0)) {
    return { kind: "portion-missing" };
  }
  if (!Number.isFinite(total) || total <= 0) return null;
  const sum = directSplitsTotal(sourceIds, amounts);
  // A shilling of rounding is not a disagreement worth blocking a save over,
  // matching what the phone already tolerates.
  if (Math.abs(sum - total) < 1) return null;
  return sum < total ? { kind: "short", by: total - sum } : { kind: "over", by: sum - total };
}

export function describeDirectSplitProblem(problem: DirectSplitProblem, currency = "KES"): string {
  switch (problem.kind) {
    case "none-selected":
      return "Choose at least one income source that funded this expense.";
    case "portion-missing":
      return "Enter how much came from every selected income source.";
    case "short":
      return `${currency} ${Math.round(problem.by).toLocaleString()} is still unfunded. Add another income source or raise a portion.`;
    case "over":
      return `Funding is over by ${currency} ${Math.round(problem.by).toLocaleString()}. Lower a portion.`;
  }
}

/** The portions as the API stores them. */
export function buildDirectSplits({
  userId,
  sourceIds,
  amounts,
  nameOf,
}: {
  userId: string | null | undefined;
  sourceIds: readonly number[];
  amounts: Readonly<Record<string, string>>;
  nameOf: (incomeSourceId: number) => string | undefined;
}): FundingSplit[] {
  return sourceIds.map((incomeSourceId) => ({
    userId: userId ?? null,
    label: nameOf(incomeSourceId) ?? "Personal funds",
    amount: Number(amounts[String(incomeSourceId)] || 0) || 0,
    incomeSourceId,
    fromBank: false,
  }));
}
