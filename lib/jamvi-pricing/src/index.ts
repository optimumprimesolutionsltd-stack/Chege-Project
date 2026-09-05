/**
 * Jamvi is one subscription, bought per member.
 *
 * It replaced seven group packages (Personal Free through Unlimited) that
 * priced a group by its size. That model charged the wrong thing: it capped
 * how many people could share a budget, and it left every solo user — the
 * majority, and the ones who open the app most — paying nothing.
 *
 * Now each member pays for themselves and groups cost nothing. A chama of
 * fifty is not a plan, it is fifty current members. There is no member limit
 * to enforce anywhere, and no tier for anyone to choose.
 */

export const PACKAGE_CODE = {
  JAMVI: "JAMVI",
} as const;

export type PackageCode = (typeof PACKAGE_CODE)[keyof typeof PACKAGE_CODE];

export const BILLING_INTERVAL = {
  MONTHLY: "monthly",
  ANNUAL: "annual",
} as const;

export type BillingInterval = (typeof BILLING_INTERVAL)[keyof typeof BILLING_INTERVAL];

export const SUBSCRIPTION_STATUS = {
  /** Paying for nothing yet. Full access; ends TRIAL_DAYS after signup. */
  TRIAL: "trial",
  /** Chosen a plan, first payment not yet confirmed. */
  PENDING: "pending",
  /** Paid and current. */
  ACTIVE: "active",
  /** Payment missed. Still full access until the grace period ends. */
  PAST_DUE: "past_due",
  /** Stopped by the member. Access runs to the end of the paid period. */
  CANCELLED: "cancelled",
  /** Grace period spent. Read-only: nothing is ever deleted. */
  EXPIRED: "expired",
} as const;

export type SubscriptionStatus =
  (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

/** A new member gets a full monthly cycle before being asked for anything.
 *  Shorter than this and a salaried member can finish the trial without ever
 *  recording a payday, having budgeted against income they never saw. */
export const TRIAL_DAYS = 30;

/** Days after a missed payment before access drops to read-only. Long enough
 *  that a failed M-Pesa deduction is not punished as if it were a decision. */
export const GRACE_DAYS = 7;

export const ENTITLEMENT = {
  PERSONAL_INCOME: "personal_income_tracking",
  PERSONAL_EXPENSES: "personal_expense_tracking",
  PERSONAL_BUDGETS: "personal_budgets",
  PERSONAL_CATEGORIES: "personal_categories",
  PERSONAL_SAVINGS_GOALS: "personal_savings_goals",
  FULL_HISTORY: "full_month_history",
  REPORTS: "reports_and_trends",
  EXPORTS: "exportable_records",
  SHARED_GROUP_ACCESS: "shared_group_access",
  SHARED_INCOME_EXPENSES: "shared_income_expense_tracking",
  SHARED_BANK_ACCOUNTS: "shared_bank_accounts",
  SHARED_SAVINGS_GOALS: "shared_savings_goals",
  MEMBER_CONTRIBUTIONS: "member_contribution_tracking",
  ADMIN_MEMBER_ROLES: "administrator_member_roles",
  ASK_JAMVI: "ask_jamvi",
} as const;

export type Entitlement = (typeof ENTITLEMENT)[keyof typeof ENTITLEMENT];

/** One plan, so it grants everything. Kept as a list rather than a boolean
 *  because callers ask "may this member do X", and that question should not
 *  have to change if a second plan ever appears. */
export const ALL_ENTITLEMENTS = Object.values(ENTITLEMENT) as readonly Entitlement[];

/**
 * What a member keeps when their subscription lapses.
 *
 * Deliberately not empty. A locked month is a reason to come back; a deleted
 * one ends the relationship. Lapsed members keep their own current month and
 * every figure they have already recorded — they lose reach, never records.
 */
export const LAPSED_ENTITLEMENTS = [
  ENTITLEMENT.PERSONAL_INCOME,
  ENTITLEMENT.PERSONAL_EXPENSES,
  ENTITLEMENT.PERSONAL_CATEGORIES,
] as const satisfies readonly Entitlement[];

export interface JamviPackage {
  code: PackageCode;
  displayName: string;
  description: string;
  audience: string;
  monthlyPriceKes: number;
  annualPriceKes: number;
  currency: "KES";
  annualSavingKes: number;
  trialDays: number;
  entitlements: readonly Entitlement[];
  featureLabels: readonly string[];
  enabled: boolean;
}

export const JAMVI_PACKAGE: JamviPackage = {
  code: PACKAGE_CODE.JAMVI,
  displayName: "Jamvi",
  description: "Your own budget, and every group you are part of.",
  audience: "Everyone using Jamvi",
  monthlyPriceKes: 100,
  annualPriceKes: 1_000,
  currency: "KES",
  annualSavingKes: 200,
  trialDays: TRIAL_DAYS,
  entitlements: ALL_ENTITLEMENTS,
  featureLabels: [
    "Your personal budget, income and expenses",
    "Join or create any number of Shared budgets",
    "No limit on how many people share a budget",
    "Shared bank accounts, savings goals and contributions",
    "Full history, reports and exports",
    "Ask Jamvi",
  ],
  enabled: true,
};

/** Kept as an array because the catalogue endpoint, the pricing page and the
 *  seeded subscription_plans rows all iterate it. One entry today. */
export const JAMVI_PACKAGES: readonly JamviPackage[] = [JAMVI_PACKAGE];

export const PACKAGE_CODES = JAMVI_PACKAGES.map((plan) => plan.code);
export const BILLING_INTERVALS = Object.values(BILLING_INTERVAL);
export const SUBSCRIPTION_STATUSES = Object.values(SUBSCRIPTION_STATUS);

export function calculateAnnualSavingKes(
  monthlyPriceKes: number,
  annualPriceKes: number,
): number {
  if (!Number.isSafeInteger(monthlyPriceKes) || !Number.isSafeInteger(annualPriceKes)) {
    throw new Error("Jamvi prices must use whole KES integers.");
  }
  return (monthlyPriceKes * 12) - annualPriceKes;
}

export function getJamviPackage(code: PackageCode): JamviPackage {
  const plan = JAMVI_PACKAGES.find((item) => item.code === code);
  if (!plan) throw new Error(`Unknown Jamvi package: ${code}`);
  return plan;
}

export function isPackageCode(value: unknown): value is PackageCode {
  return typeof value === "string" && PACKAGE_CODES.includes(value as PackageCode);
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return typeof value === "string"
    && BILLING_INTERVALS.includes(value as BillingInterval);
}

/**
 * Whether this status still carries full access.
 *
 * past_due is included on purpose: a missed deduction is not a decision to
 * leave, and the grace window is what separates the two. Whether the window
 * has closed is a question about dates, answered by the caller that holds
 * them, not by the status alone.
 */
export function statusGrantsFullAccess(status: SubscriptionStatus): boolean {
  return status === SUBSCRIPTION_STATUS.TRIAL
    || status === SUBSCRIPTION_STATUS.ACTIVE
    || status === SUBSCRIPTION_STATUS.PAST_DUE
    || status === SUBSCRIPTION_STATUS.CANCELLED;
}

/** What a member may do, given where their subscription has got to. */
export function entitlementsForStatus(
  status: SubscriptionStatus,
): readonly Entitlement[] {
  return statusGrantsFullAccess(status) ? ALL_ENTITLEMENTS : LAPSED_ENTITLEMENTS;
}

export function priceKes(interval: BillingInterval): number {
  return interval === BILLING_INTERVAL.ANNUAL
    ? JAMVI_PACKAGE.annualPriceKes
    : JAMVI_PACKAGE.monthlyPriceKes;
}

if (JAMVI_PACKAGE.annualPriceKes !== JAMVI_PACKAGE.monthlyPriceKes * 10) {
  throw new Error("Annual pricing must equal ten monthly payments — two months free.");
}

if (
  JAMVI_PACKAGE.annualSavingKes
  !== calculateAnnualSavingKes(JAMVI_PACKAGE.monthlyPriceKes, JAMVI_PACKAGE.annualPriceKes)
) {
  throw new Error("Jamvi annual saving is inconsistent with its prices.");
}
