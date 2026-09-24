import type { MemberEntitlements } from "./subscription-status";

export type PlanChoice = "trial" | "pay";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

export function planChoiceKey(userId: string): string {
  return `jamvi:plan-choice:${userId}`;
}

export function readPlanChoice(userId: string, storage: Storage): PlanChoice | null {
  try {
    const value = storage.getItem(planChoiceKey(userId));
    return value === "trial" || value === "pay" ? value : null;
  } catch {
    return null;
  }
}

export function recordPlanChoice(userId: string, choice: PlanChoice, storage: Storage): void {
  try {
    storage.setItem(planChoiceKey(userId), choice);
  } catch {
    /* private mode: they will be asked again next visit, which is harmless */
  }
}

/** Somebody still on the free trial who has not yet said what they intend.
 *  Paying and lapsed members are never stopped by it. */
export function shouldShowPlanChoice(
  entitlements: MemberEntitlements | undefined,
  choice: PlanChoice | null,
): boolean {
  if (!entitlements || choice !== null) return false;
  return entitlements.status === "trial" && entitlements.fullAccess;
}

/** Pages a person must always be able to reach: the links they arrive by and
 *  the payment page the "Pay now" button opens. */
export function planChoiceExempt(path: string): boolean {
  return path.startsWith("/invite/") || path.startsWith("/join/") || path.startsWith("/subscription");
}
