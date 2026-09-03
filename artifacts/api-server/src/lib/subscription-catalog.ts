import {
  db,
  groupSubscriptionsTable,
  groupsTable,
  subscriptionPlansTable,
} from "@workspace/db";
import {
  JAMVI_PACKAGES,
  PACKAGE_CODE,
  SUBSCRIPTION_STATUS,
  getJamviPackage,
  type JamviPackage,
  type PackageCode,
} from "@workspace/jamvi-pricing";
import { and, desc, eq, inArray } from "drizzle-orm";

type DbOrTransaction = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const entitlementStatuses = [
  SUBSCRIPTION_STATUS.TRIAL,
  SUBSCRIPTION_STATUS.ACTIVE,
  SUBSCRIPTION_STATUS.PAST_DUE,
] as const;

export function subscriptionStatusGrantsEntitlements(status: string): boolean {
  return entitlementStatuses.includes(status as (typeof entitlementStatuses)[number]);
}

export interface ResolvedEntitlements {
  subjectType: "user" | "group";
  packageCode: PackageCode | null;
  packageName: string;
  memberLimit: number | null;
  featureFlags: readonly string[];
  billingState: "free" | "unsubscribed" | (typeof entitlementStatuses)[number];
  billingInterval: "monthly" | "annual" | null;
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
    memberLimit: plan.memberLimit,
    annualSavingKes: plan.annualSavingKes,
    featureEntitlements: [...plan.entitlements],
    displayOrder: plan.displayOrder,
    recommended: plan.recommended,
    personal: plan.personal,
  };
}

/**
 * Idempotent seed from the typed catalogue. Paid enabled-state is deliberately
 * omitted on updates so an authorized future admin can stop new selections
 * without changing historical subscriptions or existing entitlements.
 */
export async function ensureSubscriptionPlanCatalogue(
  executor: DbOrTransaction = db,
): Promise<void> {
  for (const plan of JAMVI_PACKAGES) {
    const values = planValues(plan);
    await executor
      .insert(subscriptionPlansTable)
      .values({ ...values, enabled: true })
      .onConflictDoUpdate({
        target: subscriptionPlansTable.code,
        set: {
          ...values,
          ...(plan.code === PACKAGE_CODE.PERSONAL_FREE ? { enabled: true } : {}),
          updatedAt: new Date(),
        },
      });
  }
}

export async function listSelectablePackages(): Promise<JamviPackage[]> {
  await ensureSubscriptionPlanCatalogue();
  const rows = await db
    .select({ code: subscriptionPlansTable.code })
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.enabled, true))
    .orderBy(subscriptionPlansTable.displayOrder);

  return packagesForEnabledCodes(rows.map((row) => row.code));
}

export function packagesForEnabledCodes(enabledCodes: readonly string[]): JamviPackage[] {
  const enabled = new Set(enabledCodes);
  // Personal Free is a product invariant, not an optional catalogue flag.
  enabled.add(PACKAGE_CODE.PERSONAL_FREE);
  return JAMVI_PACKAGES.filter((plan) => enabled.has(plan.code));
}

/**
 * Internal capability only. Do not expose this as a public route until Jamvi
 * has an authenticated platform-admin boundary. Personal Free cannot be
 * disabled.
 */
export async function setPaidPackageEnabled(
  code: Exclude<PackageCode, "PERSONAL_FREE">,
  enabled: boolean,
): Promise<void> {
  await db
    .update(subscriptionPlansTable)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(subscriptionPlansTable.code, code));
}

export function resolveUserEntitlements(): ResolvedEntitlements {
  const plan = getJamviPackage(PACKAGE_CODE.PERSONAL_FREE);
  return {
    subjectType: "user",
    packageCode: plan.code,
    packageName: plan.displayName,
    memberLimit: plan.memberLimit,
    featureFlags: plan.entitlements,
    billingState: "free",
    billingInterval: null,
  };
}

export async function resolveGroupEntitlements(
  groupId: number,
  executor: DbOrTransaction = db,
): Promise<ResolvedEntitlements> {
  const [subscription] = await executor
    .select({
      packageCode: groupSubscriptionsTable.packageCode,
      status: groupSubscriptionsTable.status,
      billingInterval: groupSubscriptionsTable.billingInterval,
    })
    .from(groupSubscriptionsTable)
    .where(and(
      eq(groupSubscriptionsTable.groupId, groupId),
      inArray(groupSubscriptionsTable.status, [...entitlementStatuses]),
    ))
    .orderBy(desc(groupSubscriptionsTable.createdAt))
    .limit(1);

  if (subscription) {
    const plan = getJamviPackage(subscription.packageCode as PackageCode);
    return {
      subjectType: "group",
      packageCode: plan.code,
      packageName: plan.displayName,
      memberLimit: plan.memberLimit,
      featureFlags: plan.entitlements,
      billingState: subscription.status as (typeof entitlementStatuses)[number],
      billingInterval: subscription.billingInterval as "monthly" | "annual",
    };
  }

  // Preserve the old paid flag until every historical group has a subscription
  // record. It represented unlimited capacity before package codes existed.
  const [group] = await executor
    .select({ plan: groupsTable.plan })
    .from(groupsTable)
    .where(eq(groupsTable.id, groupId))
    .limit(1);
  if (group?.plan === "paid") {
    const plan = getJamviPackage(PACKAGE_CODE.UNLIMITED);
    return {
      subjectType: "group",
      packageCode: plan.code,
      packageName: plan.displayName,
      memberLimit: null,
      featureFlags: plan.entitlements,
      billingState: "active",
      billingInterval: null,
    };
  }

  return {
    subjectType: "group",
    packageCode: null,
    packageName: "No active Shared package",
    memberLimit: Number(process.env.FREE_MEMBER_LIMIT ?? 6),
    featureFlags: [],
    billingState: "unsubscribed",
    billingInterval: null,
  };
}