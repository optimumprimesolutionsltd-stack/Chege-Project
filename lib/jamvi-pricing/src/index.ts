export const PACKAGE_CODE = {
  PERSONAL_FREE: "PERSONAL_FREE",
  DUO: "DUO",
  SMALL_GROUP: "SMALL_GROUP",
  COMMUNITY: "COMMUNITY",
  CLUB: "CLUB",
  CHAMA: "CHAMA",
  UNLIMITED: "UNLIMITED",
} as const;

export type PackageCode = (typeof PACKAGE_CODE)[keyof typeof PACKAGE_CODE];

export const BILLING_INTERVAL = {
  MONTHLY: "monthly",
  ANNUAL: "annual",
} as const;

export type BillingInterval = (typeof BILLING_INTERVAL)[keyof typeof BILLING_INTERVAL];

export const SUBSCRIPTION_STATUS = {
  TRIAL: "trial",
  PENDING: "pending",
  ACTIVE: "active",
  PAST_DUE: "past_due",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
} as const;

export type SubscriptionStatus =
  (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

export const ENTITLEMENT = {
  PERSONAL_INCOME: "personal_income_tracking",
  PERSONAL_EXPENSES: "personal_expense_tracking",
  PERSONAL_BUDGETS: "personal_budgets",
  PERSONAL_CATEGORIES: "personal_categories",
  BASIC_REPORTS: "basic_reports",
  SHARED_GROUP_ACCESS: "shared_group_access",
  SHARED_INCOME_EXPENSES: "shared_income_expense_tracking",
  SEPARATE_PERSONAL_SHARED: "separate_personal_shared_budgets",
  SHARED_BANK_ACCOUNTS: "shared_bank_accounts",
  SHARED_SAVINGS_GOALS: "shared_savings_goals",
  BASIC_SHARED_REPORTS: "basic_shared_reports",
  MULTIPLE_BANK_ACCOUNTS: "multiple_bank_accounts",
  MEMBER_CONTRIBUTIONS: "member_contribution_tracking",
  SHARED_CATEGORIES: "shared_categories",
  SHARED_BUDGET_LIMITS: "shared_budget_limits",
  BASIC_ACTIVITY_HISTORY: "basic_activity_history",
  CONTRIBUTION_CYCLES: "contribution_cycles",
  MEMBER_CONTRIBUTION_RECORDS: "member_contribution_records",
  EMERGENCY_GOALS: "emergency_goals",
  GROUP_FINANCIAL_SUMMARIES: "group_financial_summaries",
  ADMIN_MEMBER_ROLES: "administrator_member_roles",
  MULTIPLE_ADMINISTRATORS: "multiple_administrators",
  DETAILED_REPORTS: "detailed_reports",
  EXPORTABLE_RECORDS: "exportable_records",
  SHARED_PROJECTS: "shared_projects",
  EVENT_BUDGETS: "event_budgets",
  ACCOUNTABILITY_HISTORY: "improved_accountability_history",
  TREASURER_ROLE: "treasurer_role",
  LOAN_TRACKING: "loan_tracking",
  WELFARE_FUND_TRACKING: "welfare_fund_tracking",
  MEMBER_BALANCES: "member_balances",
  ENHANCED_REPORTS_EXPORTS: "enhanced_reports_exports",
  HIGHER_ASK_JAMVI: "higher_ask_jamvi_allowance",
  ADVANCED_PERMISSIONS: "advanced_permissions",
  ORGANIZATION_TOOLS: "organization_management_tools",
  FULL_REPORTING_EXPORTS: "full_reporting_exports",
  DETAILED_ACTIVITY_HISTORY: "detailed_financial_activity_history",
  PRIORITY_SUPPORT: "priority_support",
  FAIR_USE_ASK_JAMVI: "fair_use_ask_jamvi_allowance",
} as const;

export type Entitlement = (typeof ENTITLEMENT)[keyof typeof ENTITLEMENT];

export interface JamviPackage {
  code: PackageCode;
  displayName: string;
  description: string;
  audience: string;
  monthlyPriceKes: number;
  annualPriceKes: number;
  currency: "KES";
  memberLimit: number | null;
  annualSavingKes: number | null;
  entitlements: readonly Entitlement[];
  featureLabels: readonly string[];
  displayOrder: number;
  enabled: boolean;
  recommended: boolean;
  personal: boolean;
  inheritanceLabel: string;
}

const personalEntitlements = [
  ENTITLEMENT.PERSONAL_INCOME,
  ENTITLEMENT.PERSONAL_EXPENSES,
  ENTITLEMENT.PERSONAL_BUDGETS,
  ENTITLEMENT.PERSONAL_CATEGORIES,
  ENTITLEMENT.BASIC_REPORTS,
  ENTITLEMENT.SHARED_GROUP_ACCESS,
] as const;

const duoEntitlements = [
  ...personalEntitlements,
  ENTITLEMENT.SHARED_INCOME_EXPENSES,
  ENTITLEMENT.SEPARATE_PERSONAL_SHARED,
  ENTITLEMENT.SHARED_BANK_ACCOUNTS,
  ENTITLEMENT.SHARED_SAVINGS_GOALS,
  ENTITLEMENT.BASIC_SHARED_REPORTS,
] as const;

const smallGroupEntitlements = [
  ...duoEntitlements,
  ENTITLEMENT.MULTIPLE_BANK_ACCOUNTS,
  ENTITLEMENT.MEMBER_CONTRIBUTIONS,
  ENTITLEMENT.SHARED_CATEGORIES,
  ENTITLEMENT.SHARED_BUDGET_LIMITS,
  ENTITLEMENT.BASIC_ACTIVITY_HISTORY,
] as const;

const communityEntitlements = [
  ...smallGroupEntitlements,
  ENTITLEMENT.CONTRIBUTION_CYCLES,
  ENTITLEMENT.MEMBER_CONTRIBUTION_RECORDS,
  ENTITLEMENT.EMERGENCY_GOALS,
  ENTITLEMENT.GROUP_FINANCIAL_SUMMARIES,
  ENTITLEMENT.ADMIN_MEMBER_ROLES,
] as const;

const clubEntitlements = [
  ...communityEntitlements,
  ENTITLEMENT.MULTIPLE_ADMINISTRATORS,
  ENTITLEMENT.DETAILED_REPORTS,
  ENTITLEMENT.EXPORTABLE_RECORDS,
  ENTITLEMENT.SHARED_PROJECTS,
  ENTITLEMENT.EVENT_BUDGETS,
  ENTITLEMENT.ACCOUNTABILITY_HISTORY,
] as const;

const chamaEntitlements = [
  ...clubEntitlements,
  ENTITLEMENT.TREASURER_ROLE,
  ENTITLEMENT.LOAN_TRACKING,
  ENTITLEMENT.WELFARE_FUND_TRACKING,
  ENTITLEMENT.MEMBER_BALANCES,
  ENTITLEMENT.ENHANCED_REPORTS_EXPORTS,
  ENTITLEMENT.HIGHER_ASK_JAMVI,
] as const;

export function calculateAnnualSavingKes(
  monthlyPriceKes: number,
  annualPriceKes: number,
): number {
  if (!Number.isSafeInteger(monthlyPriceKes) || !Number.isSafeInteger(annualPriceKes)) {
    throw new Error("Jamvi prices must use whole KES integers.");
  }
  return (monthlyPriceKes * 12) - annualPriceKes;
}

export const JAMVI_PACKAGES: readonly JamviPackage[] = [
  {
    code: PACKAGE_CODE.PERSONAL_FREE,
    displayName: "Personal Free",
    description: "Your private starting place for everyday money.",
    audience: "Every individual Jamvi user",
    monthlyPriceKes: 0,
    annualPriceKes: 0,
    currency: "KES",
    memberLimit: 1,
    annualSavingKes: null,
    entitlements: personalEntitlements,
    featureLabels: [
      "Personal income tracking",
      "Personal expense tracking",
      "Personal budgets and categories",
      "Basic personal reports",
      "Create or join a Shared budget",
    ],
    displayOrder: 1,
    enabled: true,
    recommended: false,
    personal: true,
    inheritanceLabel: "Included for every Jamvi user",
  },
  {
    code: PACKAGE_CODE.DUO,
    displayName: "Jamvi Duo",
    description: "A focused Shared budget for two people.",
    audience: "Couples and two-person shared budgets",
    monthlyPriceKes: 300,
    annualPriceKes: 3_000,
    currency: "KES",
    memberLimit: 2,
    annualSavingKes: 600,
    entitlements: duoEntitlements,
    featureLabels: [
      "Shared income and expense tracking",
      "Separate Personal and Shared budgets",
      "Shared bank accounts and savings goals",
      "Basic shared reports",
    ],
    displayOrder: 2,
    enabled: true,
    recommended: false,
    personal: false,
    inheritanceLabel: "Everything in Personal Free, plus…",
  },
  {
    code: PACKAGE_CODE.SMALL_GROUP,
    displayName: "Jamvi Small Group",
    description: "The practical package for growing groups.",
    audience: "Small households, friends, and informal teams",
    monthlyPriceKes: 500,
    annualPriceKes: 5_000,
    currency: "KES",
    memberLimit: 6,
    annualSavingKes: 1_000,
    entitlements: smallGroupEntitlements,
    featureLabels: [
      "Multiple bank accounts",
      "Member contribution tracking",
      "Shared categories",
      "Shared budget limits",
      "Basic activity history",
    ],
    displayOrder: 3,
    enabled: true,
    recommended: true,
    personal: false,
    inheritanceLabel: "Everything in Duo, plus…",
  },
  {
    code: PACKAGE_CODE.COMMUNITY,
    displayName: "Jamvi Community",
    description: "Structure and visibility for active community groups.",
    audience: "Small Chamas, welfare groups, and community teams",
    monthlyPriceKes: 1_000,
    annualPriceKes: 10_000,
    currency: "KES",
    memberLimit: 15,
    annualSavingKes: 2_000,
    entitlements: communityEntitlements,
    featureLabels: [
      "Contribution cycles and member records",
      "Savings and emergency goals",
      "Group financial summaries",
      "Administrator and member roles",
    ],
    displayOrder: 4,
    enabled: true,
    recommended: false,
    personal: false,
    inheritanceLabel: "Everything in Small Group, plus…",
  },
  {
    code: PACKAGE_CODE.CLUB,
    displayName: "Jamvi Club",
    description: "Deeper accountability for organized groups.",
    audience: "Clubs, associations, and organized groups",
    monthlyPriceKes: 1_500,
    annualPriceKes: 15_000,
    currency: "KES",
    memberLimit: 30,
    annualSavingKes: 3_000,
    entitlements: clubEntitlements,
    featureLabels: [
      "Multiple administrators",
      "Detailed reports and exportable records",
      "Shared projects and event budgets",
      "Improved accountability history",
    ],
    displayOrder: 5,
    enabled: true,
    recommended: false,
    personal: false,
    inheritanceLabel: "Everything in Community, plus…",
  },
  {
    code: PACKAGE_CODE.CHAMA,
    displayName: "Jamvi Chama",
    description: "Purpose-built controls for larger Chamas.",
    audience: "Larger or more structured Chamas",
    monthlyPriceKes: 2_000,
    annualPriceKes: 20_000,
    currency: "KES",
    memberLimit: 50,
    annualSavingKes: 4_000,
    entitlements: chamaEntitlements,
    featureLabels: [
      "Treasurer and administrator roles",
      "Loan and welfare-fund tracking",
      "Member balances",
      "Enhanced reports and exports",
      "Higher Ask Jamvi allowance",
    ],
    displayOrder: 6,
    enabled: true,
    recommended: false,
    personal: false,
    inheritanceLabel: "Everything in Club, plus…",
  },
  {
    code: PACKAGE_CODE.UNLIMITED,
    displayName: "Jamvi Unlimited",
    description: "Organization-level visibility without a member ceiling.",
    audience: "Large associations, institutions, and organizations",
    monthlyPriceKes: 5_000,
    annualPriceKes: 50_000,
    currency: "KES",
    memberLimit: null,
    annualSavingKes: 10_000,
    entitlements: [
      ...chamaEntitlements,
      ENTITLEMENT.ADVANCED_PERMISSIONS,
      ENTITLEMENT.ORGANIZATION_TOOLS,
      ENTITLEMENT.FULL_REPORTING_EXPORTS,
      ENTITLEMENT.DETAILED_ACTIVITY_HISTORY,
      ENTITLEMENT.PRIORITY_SUPPORT,
      ENTITLEMENT.FAIR_USE_ASK_JAMVI,
    ],
    featureLabels: [
      "Unlimited members",
      "Advanced permissions",
      "Organization-level management tools",
      "Full reporting and exports",
      "Detailed financial activity history",
      "Priority support",
      "Higher or unlimited Ask Jamvi allowance, subject to fair use",
    ],
    displayOrder: 7,
    enabled: true,
    recommended: false,
    personal: false,
    inheritanceLabel: "Everything in Chama, plus…",
  },
];

export const PACKAGE_CODES = JAMVI_PACKAGES.map((plan) => plan.code);
export const BILLING_INTERVALS = Object.values(BILLING_INTERVAL);
export const SUBSCRIPTION_STATUSES = Object.values(SUBSCRIPTION_STATUS);

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

for (const plan of JAMVI_PACKAGES) {
  if (plan.personal) {
    if (plan.code !== PACKAGE_CODE.PERSONAL_FREE || plan.monthlyPriceKes !== 0 || plan.annualPriceKes !== 0) {
      throw new Error("Personal Free must remain the free personal package.");
    }
    continue;
  }
  if (plan.annualPriceKes !== plan.monthlyPriceKes * 10) {
    throw new Error(`${plan.code} annual pricing must equal ten monthly payments.`);
  }
  if (plan.annualSavingKes !== calculateAnnualSavingKes(plan.monthlyPriceKes, plan.annualPriceKes)) {
    throw new Error(`${plan.code} annual saving is inconsistent.`);
  }
}