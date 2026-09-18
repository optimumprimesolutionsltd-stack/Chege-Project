export type MobileOnboardingMode = "personal" | "shared" | "both";
export type MobileBudgetDuration = "ongoing" | "week" | "month" | "quarter" | "custom";

/**
 * Same labels used by the onboarding wizard and, later, the Settings edit
 * card — one definition so the two cannot drift from what the duration meant
 * when it was chosen.
 *
 * Parameterized on `isShared` because "budgeting" is the right word for a
 * personal account and the wrong one for a chama or church, which thinks in
 * contributions and spending rather than a personal spending plan. Only the
 * "ongoing" entry actually depends on this; the rest are duration-only and
 * read fine either way.
 */
export function budgetDurationLabels(isShared: boolean): Record<MobileBudgetDuration, { title: string; description: string }> {
  return {
    ongoing: isShared
      ? { title: "Everyday contributions", description: "For the group’s regular contributions and spending." }
      : { title: "Everyday budgeting", description: "For your regular personal money." },
    week: { title: "Up to 1 week", description: "For a short trip, event, or weekly plan." },
    month: { title: "Up to 1 month", description: "For a monthly challenge, project, or trip." },
    quarter: { title: "Up to 3 months", description: "For a school term, campaign, or longer project." },
    custom: { title: "Set an end date", description: "Choose the exact date this budget should finish." },
  };
}

const pad = (value: number) => String(value).padStart(2, "0");
export const isoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** The earliest a budget can be set to finish: one ending today has no room
 *  left to record anything in. */
export const tomorrow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date;
};

/** Same rule the onboarding wizard applies to its own duration step, reused
 *  so editing a budget's duration later cannot accept what choosing it the
 *  first time would have refused. */
export function budgetDurationEditError(durationType: MobileBudgetDuration, customEndDate: string): string | null {
  if (durationType !== "custom") return null;
  if (!customEndDate) return "Choose an end date for this budget.";
  if (customEndDate <= isoDate(new Date())) return "Choose an end date in the future.";
  return null;
}

/** A couple's two starting points need different categories and income
 *  sources: a household already sharing bills, or a wedding still being
 *  saved and paid for. */
export type CoupleStage = "together" | "wedding";

export type MobileOnboardingDraft = {
  usageMode: MobileOnboardingMode;
  persona: string | null;
  /** Only meaningful when persona is "couple". */
  coupleStage: CoupleStage | null;
  budgetDuration: MobileBudgetDuration;
  customEndDate: string;
  lastStep?: number;
  selectedCategories: string[];
  customCategories: string[];
  categoryBudgets: Record<string, string>;
  selectedIncomeStreams: string[];
  incomeAmounts: Record<string, string>;
  /** For a group: what each member is expected to contribute per month, as a
   *  plain KES string. Applied as the group's default contribution target. */
  memberContribution?: string;
  /** How many people the group expects, as a plain string. A guess, not an
   *  enforced cap — it only steers what Jamvi recommends. */
  expectedMemberCount?: string;
};

const ONBOARDING_CATEGORY_ALIASES: Record<string, string> = {
  "food & meals": "Food",
  groceries: "Food",
  accommodation: "Housing",
  rent: "Housing",
  "tuition & fees": "Education",
  "school fees": "Education",
};

export function normalizeCategoryName(name: string): string {
  return name.trim().toLocaleLowerCase("en-US");
}

export function canonicalCategoryName(name: string): string {
  const trimmed = name.trim();
  return ONBOARDING_CATEGORY_ALIASES[normalizeCategoryName(trimmed)] ?? trimmed;
}

export function dedupeCategoryNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  return names.reduce<string[]>((result, name) => {
    const canonical = canonicalCategoryName(name);
    const normalized = normalizeCategoryName(canonical);
    if (!normalized || seen.has(normalized)) return result;
    seen.add(normalized);
    result.push(canonical);
    return result;
  }, []);
}

export const ONBOARDING_CATEGORY_TIERS = [
  {
    priority: 1,
    label: "Essentials",
    description: "The costs that keep life moving.",
    categories: ["Food", "Housing", "Utilities", "Shared bills", "Transport"],
  },
  {
    priority: 2,
    label: "Important",
    description: "Regular needs worth planning for.",
    categories: ["Health", "Education", "Books & supplies", "Family support", "Personal care", "Insurance"],
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
    categories: ["Entertainment", "Dates & activities", "Events", "Events & programs", "Equipment", "Venue", "Clothing", "Gifts", "Member welfare", "Welfare & benevolence", "Building & upkeep", "Outreach & missions", "Projects", "Loans", "Other"],
  },
] as const;

export const ALL_ONBOARDING_CATEGORIES = dedupeCategoryNames(ONBOARDING_CATEGORY_TIERS.flatMap((tier) => tier.categories));

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

/**
 * What brings money into a group. For a chama or welfare group the members'
 * own contributions are the main source, not a personal salary — so the
 * shared-onboarding income step offers these instead of COMMON_INCOME_STREAMS.
 */
export const GROUP_INCOME_STREAMS = [
  "Member contributions",
  "Joining or registration fees",
  "Fines and penalties",
  "Fundraising and events",
  "Interest from group loans",
  "Grants or donations",
  "Investment returns",
  "Other group income",
] as const;

/**
 * A couple saving toward a wedding is not living on pooled income yet — the
 * money is each person's own, set aside for one event, often topped up by
 * family. None of GROUP_INCOME_STREAMS' membership fees or fines apply, and
 * COMMON_INCOME_STREAMS misses the gifts and family top-ups that pay for a
 * lot of weddings.
 */
export const WEDDING_INCOME_STREAMS = [
  "Salary or wages",
  "Personal savings",
  "Family contributions",
  "Wedding gifts or cash gifts",
  "Business or side hustle",
  "Other income",
] as const;

// A couple, friends, or family pool money each of them already earns
// elsewhere — the same question COMMON_INCOME_STREAMS asks a single person.
// A chama, church, club, or student group instead collects money that only
// exists because the group does: dues, fines, fundraising, grants.
const HOUSEHOLD_LIKE_PERSONAS = new Set(["couple", "friends", "family"]);

/** The income options for whichever way Jamvi is being set up. */
export function incomeStreamsForMode(
  usageMode: MobileOnboardingMode,
  persona: string | null = null,
  coupleStage: CoupleStage | null = null,
): readonly string[] {
  if (usageMode !== "shared") return COMMON_INCOME_STREAMS;
  if (persona === "couple" && coupleStage === "wedding") return WEDDING_INCOME_STREAMS;
  return HOUSEHOLD_LIKE_PERSONAS.has(persona ?? "") ? COMMON_INCOME_STREAMS : GROUP_INCOME_STREAMS;
}

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
    ["church", "A church or fellowship", "Track offerings, funds, and what the church runs."],
    ["club", "A club or team", "Manage membership money, events, and projects."],
    ["student_group", "A student group", "Share school, welfare, class, or campus costs."],
    ["other", "Something else", "Tell Jamvi what matters to your group."],
  ],
} as const;

const PURPOSE_CATEGORY_MAP: Record<string, readonly string[]> = {
  student: ["Food", "Housing", "Transport", "Education", "Books & supplies", "Airtime & data", "Personal care", "Entertainment", "Other"],
  working: ["Food", "Housing", "Utilities", "Transport", "Health", "Insurance", "Personal care", "Other"],
  business: ["Food", "Transport", "Health", "Work & business", "Business supplies", "Stock & inventory", "Airtime & data", "Other"],
  couple: ["Food", "Housing", "Shared bills", "Utilities", "Transport", "Health", "Dates & activities", "Other"],
  couple_wedding: ["Venue", "Catering", "Attire", "Photography & video", "Decor", "Invitations & stationery", "Gifts", "Transport", "Other"],
  friends: ["Food", "Housing", "Shared bills", "Utilities", "Transport", "Entertainment", "Dates & activities", "Airtime & data"],
  family: ["Food", "Housing", "Utilities", "Transport", "Health", "Education", "Family support", "Insurance", "Household"],
  chama: ["Member welfare", "Loans", "Events", "Transport", "Projects", "Other"],
  church: ["Building & upkeep", "Utilities", "Outreach & missions", "Welfare & benevolence", "Events & programs", "Equipment", "Transport", "Other"],
  club: ["Member welfare", "Events", "Equipment", "Venue", "Transport", "Projects", "Entertainment", "Other"],
  student_group: ["School fees & classes", "Books & supplies", "Meals", "Transport", "Airtime & data", "Events & activities", "Welfare", "Administration"],
};

const ONBOARDING_DRAFT_STORAGE_PREFIX = "jamvi:onboarding-draft:";

export function onboardingDraftStorageKey(userId: string): string {
  return `${ONBOARDING_DRAFT_STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

export function recommendedCategoriesForPurpose(purpose: string | null, coupleStage: CoupleStage | null = null): string[] {
  const key = purpose === "couple" && coupleStage === "wedding" ? "couple_wedding" : purpose;
  return dedupeCategoryNames(key ? (PURPOSE_CATEGORY_MAP[key] ?? ALL_ONBOARDING_CATEGORIES) : ALL_ONBOARDING_CATEGORIES);
}

export function categoryPriority(category: string): number {
  const canonical = canonicalCategoryName(category);
  return ONBOARDING_CATEGORY_TIERS.find((tier) => tier.categories.some((item) => item === canonical))?.priority ?? 4;
}

export function normalizeOnboardingDraft(value: unknown): MobileOnboardingDraft | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<MobileOnboardingDraft>;
  if (raw.usageMode !== "personal" && raw.usageMode !== "shared" && raw.usageMode !== "both") return null;
  if (raw.budgetDuration !== "ongoing" && raw.budgetDuration !== "week" && raw.budgetDuration !== "month" && raw.budgetDuration !== "quarter" && raw.budgetDuration !== "custom") return null;
  if (!Array.isArray(raw.selectedCategories) || !Array.isArray(raw.customCategories) || !Array.isArray(raw.selectedIncomeStreams)) return null;
  const persona = typeof raw.persona === "string" ? raw.persona : null;
  const coupleStage = raw.coupleStage === "together" || raw.coupleStage === "wedding" ? raw.coupleStage : null;
  const selectedCategories = dedupeCategoryNames(raw.selectedCategories.filter((item): item is string => typeof item === "string"));
  const recommendedCategories = recommendedCategoriesForPurpose(persona, coupleStage);
  const customCategories = dedupeCategoryNames(raw.customCategories.filter((item): item is string => typeof item === "string"))
    .filter((category) => !recommendedCategories.some((item) => normalizeCategoryName(item) === normalizeCategoryName(category)));
  const categoryBudgets = raw.categoryBudgets && typeof raw.categoryBudgets === "object"
    ? Object.entries(raw.categoryBudgets as Record<string, unknown>).reduce<Record<string, string>>((result, [name, amount]) => {
      if (typeof amount !== "string") return result;
      const canonical = canonicalCategoryName(name);
      if (!(canonical in result)) result[canonical] = amount;
      return result;
    }, {})
    : {};
  return {
    usageMode: raw.usageMode,
    persona,
    coupleStage,
    budgetDuration: raw.budgetDuration,
    customEndDate: typeof raw.customEndDate === "string" ? raw.customEndDate : "",
    lastStep: typeof raw.lastStep === "number" && Number.isInteger(raw.lastStep) ? Math.max(0, Math.min(5, raw.lastStep)) : 0,
    selectedCategories,
    customCategories,
    categoryBudgets,
    selectedIncomeStreams: dedupeIncomeStreamNames(raw.selectedIncomeStreams.filter((item): item is string => typeof item === "string")),
    incomeAmounts: raw.incomeAmounts && typeof raw.incomeAmounts === "object" ? raw.incomeAmounts as Record<string, string> : {},
    memberContribution: typeof raw.memberContribution === "string" ? raw.memberContribution.replace(/[^0-9]/g, "") : "",
    expectedMemberCount: typeof raw.expectedMemberCount === "string" ? raw.expectedMemberCount.replace(/[^0-9]/g, "") : "",
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
