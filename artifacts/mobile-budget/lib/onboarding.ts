export type MobileOnboardingMode = "personal" | "shared" | "both";
export type MobileBudgetDuration = "ongoing" | "week" | "month" | "quarter" | "custom";

export type MobileOnboardingDraft = {
  usageMode: MobileOnboardingMode;
  persona: string | null;
  budgetDuration: MobileBudgetDuration;
  customEndDate: string;
  selectedCategories: string[];
  customCategories: string[];
  categoryBudgets: Record<string, string>;
  selectedIncomeStreams: string[];
  incomeAmounts: Record<string, string>;
};

export const ONBOARDING_CATEGORY_TIERS = [
  {
    priority: 1,
    label: "Essentials",
    description: "The costs that keep life moving.",
    categories: ["Food", "Food & meals", "Groceries", "Housing", "Accommodation", "Rent", "Utilities", "Shared bills", "Transport"],
  },
  {
    priority: 2,
    label: "Important",
    description: "Regular needs worth planning for.",
    categories: ["Health", "Education", "Tuition & fees", "Books & supplies", "Family support", "Personal care", "Insurance", "School fees"],
  },
  {
    priority: 3,
    label: "Household & connection",
    description: "The things that support your day-to-day life.",
    categories: ["Airtime & data", "Household", "Subscriptions", "Work & business", "Business supplies", "Stock & inventory"],
  },
  {
    priority: 4,
    label: "Flexible",
    description: "Optional spending and future plans.",
    categories: ["Entertainment", "Dates & activities", "Events", "Equipment", "Venue", "Clothing", "Gifts", "Member welfare", "Member contributions", "Projects", "Loans", "Other"],
  },
] as const;

export const ALL_ONBOARDING_CATEGORIES = ONBOARDING_CATEGORY_TIERS.flatMap((tier) => tier.categories);

export const COMMON_INCOME_STREAMS = [
  "Salary or wages",
  "Business or side hustle",
  "Freelance or contract work",
  "Farming or livestock",
  "Rental income",
  "Family support or remittances",
  "Pension or benefits",
  "Other income",
] as const;

export function normalizeIncomeStreamName(name: string): string {
  return name.trim().toLocaleLowerCase("en-US");
}

export function dedupeIncomeStreamNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const normalized = normalizeIncomeStreamName(name);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export const PURPOSE_OPTIONS = {
  personal: [
    ["student", "A student", "Balance school life, living costs, and personal goals."],
    ["working", "Working or employed", "Plan income, household costs, and future goals."],
    ["business", "A business owner", "Separate business costs, personal spending, and income."],
    ["other", "Something else", "Build a budget around your own priorities."],
  ],
  shared: [
    ["couple", "A couple", "Plan shared household money together."],
    ["friends", "Friends or roommates", "Split trips, bills, rent, and plans with friends."],
    ["family", "A family", "Coordinate home costs, school, health, and support."],
    ["chama", "A chama or welfare group", "Track contributions, welfare, loans, and group plans."],
    ["club", "A club, church, or team", "Manage membership money, events, and projects."],
    ["other", "Something else", "Tell Jamvi what matters to your group."],
  ],
} as const;

const PURPOSE_CATEGORY_MAP: Record<string, readonly string[]> = {
  student: ["Food & meals", "Accommodation", "Transport", "Tuition & fees", "Books & supplies", "Airtime & data", "Personal care", "Entertainment", "Other"],
  working: ["Food", "Rent", "Utilities", "Transport", "Health", "Insurance", "Personal care", "Other"],
  business: ["Food", "Transport", "Health", "Work & business", "Business supplies", "Stock & inventory", "Airtime & data", "Other"],
  couple: ["Food & meals", "Rent", "Shared bills", "Utilities", "Transport", "Health", "Dates & activities", "Other"],
  friends: ["Food & meals", "Rent", "Shared bills", "Utilities", "Transport", "Entertainment", "Dates & activities", "Airtime & data"],
  family: ["Groceries", "Rent", "Utilities", "Transport", "Health", "School fees", "Family support", "Insurance", "Household"],
  chama: ["Member welfare", "Loans", "Member contributions", "Events", "Transport", "Projects", "Other"],
  club: ["Member contributions", "Events", "Equipment", "Venue", "Transport", "Projects", "Entertainment", "Other"],
};

const ONBOARDING_DRAFT_STORAGE_PREFIX = "jamvi:onboarding-draft:";

export function onboardingDraftStorageKey(userId: string): string {
  return `${ONBOARDING_DRAFT_STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

export function recommendedCategoriesForPurpose(purpose: string | null): string[] {
  return [...(purpose ? (PURPOSE_CATEGORY_MAP[purpose] ?? ALL_ONBOARDING_CATEGORIES) : ALL_ONBOARDING_CATEGORIES)];
}

export function categoryPriority(category: string): number {
  return ONBOARDING_CATEGORY_TIERS.find((tier) => tier.categories.some((item) => item === category))?.priority ?? 4;
}

export function normalizeOnboardingDraft(value: unknown): MobileOnboardingDraft | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<MobileOnboardingDraft>;
  if (raw.usageMode !== "personal" && raw.usageMode !== "shared" && raw.usageMode !== "both") return null;
  if (raw.budgetDuration !== "ongoing" && raw.budgetDuration !== "week" && raw.budgetDuration !== "month" && raw.budgetDuration !== "quarter" && raw.budgetDuration !== "custom") return null;
  if (!Array.isArray(raw.selectedCategories) || !Array.isArray(raw.customCategories) || !Array.isArray(raw.selectedIncomeStreams)) return null;
  return {
    usageMode: raw.usageMode,
    persona: typeof raw.persona === "string" ? raw.persona : null,
    budgetDuration: raw.budgetDuration,
    customEndDate: typeof raw.customEndDate === "string" ? raw.customEndDate : "",
    selectedCategories: raw.selectedCategories.filter((item): item is string => typeof item === "string"),
    customCategories: raw.customCategories.filter((item): item is string => typeof item === "string"),
    categoryBudgets: raw.categoryBudgets && typeof raw.categoryBudgets === "object" ? raw.categoryBudgets as Record<string, string> : {},
    selectedIncomeStreams: dedupeIncomeStreamNames(raw.selectedIncomeStreams.filter((item): item is string => typeof item === "string")),
    incomeAmounts: raw.incomeAmounts && typeof raw.incomeAmounts === "object" ? raw.incomeAmounts as Record<string, string> : {},
  };
}

export async function readOnboardingDraft({
  userId,
  storage,
}: {
  userId: string;
  storage: Pick<MobileOnboardingStorage, "getItem">;
}): Promise<MobileOnboardingDraft | null> {
  try {
    const raw = await storage.getItem(onboardingDraftStorageKey(userId));
    if (!raw || typeof raw !== "string") return null;
    return normalizeOnboardingDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveOnboardingDraft({
  userId,
  draft,
  storage,
}: {
  userId: string;
  draft: MobileOnboardingDraft;
  storage: Pick<MobileOnboardingStorage, "setItem">;
}): Promise<void> {
  await storage.setItem(onboardingDraftStorageKey(userId), JSON.stringify(draft));
}

export async function clearOnboardingDraft({
  userId,
  storage,
}: {
  userId: string;
  storage: Pick<MobileOnboardingStorage, "removeItem">;
}): Promise<void> {
  await storage.removeItem(onboardingDraftStorageKey(userId));
}

type MobileOnboardingStorage = {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<unknown> | unknown;
  removeItem(key: string): Promise<unknown> | unknown;
};
