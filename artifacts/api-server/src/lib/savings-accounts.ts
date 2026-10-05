/**
 * Savings accounts: the savings products reached through M-Pesa (M-Shwari,
 * KCB M-PESA, Ziidi, Mali), kept in the Savings section next to goals.
 *
 * A goal saves up to a target and is done when it gets there. An account has
 * no target: money goes in and comes out, and what matters is its balance. An
 * account is a savings goal with a target of 0 - a goal can never be made with
 * one (the form and CreateGoalBody ask for more), so the two cannot be mixed
 * up, and no column was needed. The statement import makes one per product the
 * first time a statement moves money into or out of it (mobile-budget
 * lib/mpesaProducts). Asked for 5 Oct 2026.
 */
type GoalLike = { targetAmount: number; currentAmount: number; isCompleted?: boolean };

export const isSavingsAccount = (goal: Pick<GoalLike, "targetAmount">): boolean => goal.targetAmount <= 0;

/** Whether a goal is complete at this balance. An account never is. */
export const completeAt = (goal: Pick<GoalLike, "targetAmount">, balance: number): boolean =>
  !isSavingsAccount(goal) && balance >= goal.targetAmount;

/** How much more can go in: up to the target for a goal, anything for an account. */
export const roomIn = (goal: GoalLike): number =>
  isSavingsAccount(goal) ? Number.POSITIVE_INFINITY : goal.targetAmount - goal.currentAmount;

/**
 * What must have been in an account already for this withdrawal: a statement
 * starts part-way through, so the money was there before Jamvi's records began.
 * 0 for a goal, whose balance Jamvi always knows.
 */
export const alreadyThere = (goal: GoalLike, withdrawal: number): number =>
  isSavingsAccount(goal) ? Math.max(0, withdrawal - goal.currentAmount) : 0;
