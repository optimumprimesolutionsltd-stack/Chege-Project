import {
  db,
  subscriptionPlansTable,
  userSubscriptionsTable,
} from "@workspace/db";
import {
  ALL_ENTITLEMENTS,
  GRACE_DAYS,
  JAMVI_PACKAGE,
  JAMVI_PACKAGES,
  LAPSED_ENTITLEMENTS,
  PACKAGE_CODE,
  SUBSCRIPTION_STATUS,
  TRIAL_DAYS,
  getJamviPackage,
  statusGrantsFullAccess,
  type BillingInterval,
  type JamviPackage,
  type PackageCode,
  type SubscriptionStatus,
} from "@workspace/jamvi-pricing";
import { and, desc, eq, inArray } from "drizzle-orm";

type DbOrTransaction = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Statuses that describe a live subscription, whether or not it is paid up.
 *  Cancelled belongs here: access runs to the end of the period already paid. */
const liveStatuses = [
  SUBSCRIPTION_STATUS.TRIAL,
  SUBSCRIPTION_STATUS.PENDING,
  SUBSCRIPTION_STATUS.ACTIVE,
  SUBSCRIPTION_STATUS.PAST_DUE,
  SUBSCRIPTION_STATUS.CANCELLED,
] as const;

export function subscriptionStatusGrantsEntitlements(status: string): boolean {
  return statusGrantsFullAccess(status as SubscriptionStatus);
}

export interface ResolvedEntitlements {
  packageCode: PackageCode | null;
  packageName: string;
  featureFlags: readonly string[];
  /** False once the trial, grace or paid period has run out. Read-only, never
   *  removal: the member keeps every figure they have recorded. */
  fullAccess: boolean;
  status: SubscriptionStatus | null;
  billingInterval: BillingInterval | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}

function planValues(plan: JamviPackage) {
  return {
    code: plan.code,
    displayName: plan.displayName,
    description: plan.description,
    audience: plan.audience,
    monthlyPriceKes: plan.monthlyPriceKes,
    annualPriceKes: plan.annualPriceKes,
    currency: plan.currency,
    memberLimit: null,
    annualSavingKes: plan.annualSavingKes,
    featureEntitlements: [...plan.entitlements],
    displayOrder: 1,
    recommended: false,
    personal: false,
  };
}

/** Idempotent seed from the typed catalogue, so the database and the code
 *  cannot disagree about what Jamvi costs. */
export async function ensureSubscriptionPlanCatalogue(
  executor: DbOrTransaction = db,
): Promise<void> {
  for (const plan of JAMVI_PACKAGES) {
    const values = planValues(plan);
    await executor
      .insert(subscriptionPlansTable)
      .values({ ...values, enabled: plan.enabled })
      .onConflictDoUpdate({
        target: subscriptionPlansTable.code,
        set: values,
      });
  }
}

export async function listSelectablePackages(): Promise<JamviPackage[]> {
  const rows = await db
    .select({ code: subscriptionPlansTable.code })
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.enabled, true));
  return packagesForEnabledCodes(rows.map((row) => row.code));
}

export function packagesForEnabledCodes(enabledCodes: readonly string[]): JamviPackage[] {
  const enabled = new Set(enabledCodes);
  return JAMVI_PACKAGES.filter((plan) => enabled.has(plan.code));
}

export async function setPaidPackageEnabled(
  code: PackageCode,
  enabled: boolean,
): Promise<void> {
  await db
    .update(subscriptionPlansTable)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(subscriptionPlansTable.code, code));
}

/**
 * How far a subscription's own dates carry it, regardless of what the status
 * column says.
 *
 * Statuses are moved by whatever runs the billing, and nothing runs it yet.
 * Reading the dates means a trial that ended last week is treated as ended
 * even though no job has been along to say so — the answer is never more
 * generous than the member has actually paid for.
 */
function withinAccessWindow(
  subscription: {
    status: string;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    graceEndsAt: Date | null;
  },
  now: Date,
): boolean {
  switch (subscription.status) {
    case SUBSCRIPTION_STATUS.TRIAL:
      return subscription.trialEndsAt !== null && now < subscription.trialEndsAt;
    case SUBSCRIPTION_STATUS.ACTIVE:
      return subscription.currentPeriodEnd === null || now < subscription.currentPeriodEnd;
    case SUBSCRIPTION_STATUS.PAST_DUE:
      return subscription.graceEndsAt !== null && now < subscription.graceEndsAt;
    case SUBSCRIPTION_STATUS.CANCELLED:
      return subscription.currentPeriodEnd !== null && now < subscription.currentPeriodEnd;
    default:
      return false;
  }
}

const lapsed = (
  status: SubscriptionStatus | null,
  extras: Partial<ResolvedEntitlements> = {},
): ResolvedEntitlements => ({
  packageCode: null,
  packageName: JAMVI_PACKAGE.displayName,
  featureFlags: LAPSED_ENTITLEMENTS,
  fullAccess: false,
  status,
  billingInterval: null,
  trialEndsAt: null,
  currentPeriodEnd: null,
  ...extras,
});

/**
 * What this member may do right now.
 *
 * Replaces the per-group resolver. Groups no longer carry a plan, so the only
 * question left is whether the person in front of us is current.
 */
export async function resolveMemberEntitlements(
  userId: string,
  executor: DbOrTransaction = db,
  now: Date = new Date(),
): Promise<ResolvedEntitlements> {
  const [subscription] = await executor
    .select({
      packageCode: userSubscriptionsTable.packageCode,
      status: userSubscriptionsTable.status,
      billingInterval: userSubscriptionsTable.billingInterval,
      trialEndsAt: userSubscriptionsTable.trialEndsAt,
      currentPeriodEnd: userSubscriptionsTable.currentPeriodEnd,
      graceEndsAt: userSubscriptionsTable.graceEndsAt,
    })
    .from(userSubscriptionsTable)
    .where(and(
      eq(userSubscriptionsTable.userId, userId),
      inArray(userSubscriptionsTable.status, [...liveStatuses]),
    ))
    .orderBy(desc(userSubscriptionsTable.createdAt))
    .limit(1);

  if (!subscription) return lapsed(null);

  const status = subscription.status as SubscriptionStatus;
  if (!withinAccessWindow(subscription, now)) {
    return lapsed(status, { trialEndsAt: subscription.trialEndsAt });
  }

  const plan = getJamviPackage(subscription.packageCode as PackageCode);
  return {
    packageCode: plan.code,
    packageName: plan.displayName,
    featureFlags: ALL_ENTITLEMENTS,
    fullAccess: true,
    status,
    billingInterval: subscription.billingInterval as BillingInterval,
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodEnd: subscription.currentPeriodEnd,
  };
}

/** Whether this member may take part in Shared budgets. Paying is what makes
 *  someone eligible for groups; the groups themselves cost nothing. */
export async function memberMayUseSharedBudgets(
  userId: string,
  executor: DbOrTransaction = db,
  now: Date = new Date(),
): Promise<boolean> {
  const { fullAccess } = await resolveMemberEntitlements(userId, executor, now);
  return fullAccess;
}

export function addDays(from: Date, days: number): Date {
  const to = new Date(from);
  to.setDate(to.getDate() + days);
  return to;
}

/**
 * Gives a new member their trial, once.
 *
 * Called at signup rather than at the first paywall, so the clock starts when
 * they arrive and an invitation from a group always works. Returns the
 * existing row if one is already live, so repeated calls cannot extend a
 * trial or hand out a second one.
 */
export async function ensureTrialSubscription(
  userId: string,
  executor: DbOrTransaction = db,
  now: Date = new Date(),
): Promise<void> {
  const [existing] = await executor
    .select({ id: userSubscriptionsTable.id })
    .from(userSubscriptionsTable)
    .where(eq(userSubscriptionsTable.userId, userId))
    .limit(1);
  if (existing) return;

  await executor.insert(userSubscriptionsTable).values({
    userId,
    packageCode: PACKAGE_CODE.JAMVI,
    billingInterval: "monthly",
    status: SUBSCRIPTION_STATUS.TRIAL,
    trialEndsAt: addDays(now, TRIAL_DAYS),
  });
}

export { GRACE_DAYS, TRIAL_DAYS };
