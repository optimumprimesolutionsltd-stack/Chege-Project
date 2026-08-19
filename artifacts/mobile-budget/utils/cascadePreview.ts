export type CascadePreviewGoal = {
  id: number;
  name: string;
  targetAmount: number;
  currentAmount: number;
};

export type CascadePreviewAllocation = {
  goalId: number;
  goalName: string;
  allocated: number;
  newTotal: number;
  completed: boolean;
};

/**
 * Accepts ordinary whole-KES input, with optional correctly placed commas.
 * Scientific notation and decimals are deliberately rejected so the preview
 * and submitted amount can never interpret pasted text differently.
 */
export function parseWholeKesAmount(input: string): number | null {
  const trimmed = input.trim();
  if (!/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(trimmed)) {
    return null;
  }

  const amount = Number(trimmed.replace(/,/g, ''));
  return Number.isSafeInteger(amount) ? amount : null;
}

export function buildCascadePreview(
  amount: number,
  goals: CascadePreviewGoal[],
): { allocations: CascadePreviewAllocation[]; leftover: number } {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { allocations: [], leftover: 0 };
  }

  let remaining = amount;
  const allocations: CascadePreviewAllocation[] = [];

  for (const goal of goals) {
    if (remaining <= 0) break;
    const needed = Math.max(0, goal.targetAmount - goal.currentAmount);
    if (needed === 0) continue;

    const allocated = Math.min(needed, remaining);
    const newTotal = goal.currentAmount + allocated;
    remaining -= allocated;
    allocations.push({
      goalId: goal.id,
      goalName: goal.name,
      allocated,
      newTotal,
      completed: newTotal >= goal.targetAmount,
    });
  }

  return { allocations, leftover: remaining };
}