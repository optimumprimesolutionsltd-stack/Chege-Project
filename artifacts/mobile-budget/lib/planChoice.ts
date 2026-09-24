import type { MemberEntitlements } from './subscription-status';

export type PlanChoice = 'trial' | 'pay';

type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export function planChoiceKey(userId: string): string {
  return `jamvi:plan-choice:${userId}`;
}

export async function readPlanChoice(userId: string, storage: Storage): Promise<PlanChoice | null> {
  const value = await storage.getItem(planChoiceKey(userId));
  return value === 'trial' || value === 'pay' ? value : null;
}

export async function recordPlanChoice(userId: string, choice: PlanChoice, storage: Storage): Promise<void> {
  await storage.setItem(planChoiceKey(userId), choice);
}

/**
 * The plan screen is for somebody still on the free trial who has not yet
 * said what they intend. Anyone already paying, or already lapsed (the banner
 * and Subscription screen handle them), is never stopped by it.
 */
export function shouldShowPlanChoice(
  entitlements: MemberEntitlements | undefined,
  choice: PlanChoice | null,
): boolean {
  if (!entitlements || choice !== null) return false;
  return entitlements.status === 'trial' && entitlements.fullAccess;
}
