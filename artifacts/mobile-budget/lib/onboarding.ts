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

/**
 * What the budget is mainly FOR — distinct from `persona`, which is who it is
 * for (a couple, friends, a chama).
 *
 * Somebody whose reason for using Jamvi is clearing a loan was handed a
 * budgeting app and left to discover that debt existed. Asking once, at the
 * start, is what makes the app feel like it was built for them — and it is
 * only worth asking if the answer changes something, so it does: a debt-led
 * budget is offered debt-shaped categories first and arrives with one already
 * tracked, which is also what makes the Debt tab appear.
 */
export type BudgetGoal = "budgeting" | "saving" | "debt";

/**
 * Whether budgeting applies, given what the budget is for.
 *
 * Budgeting without amounts is worse than no budgeting: every screen reads
 * "KES 0 of KES 0 (0%)", every category looks on track, and the over-budget
 * warnings mean nothing — the app looks broken rather than empty. Somebody
 * here to save towards something, or to clear a loan, is not going to sit down
 * and set a monthly ceiling per category, so offering them the machinery is
 * offering them that failure.
 *
 * Off is never permanent: it is one switch in settings, and a budget that
 * later gains a real amount surfaces the tab on its own, the way the Debt tab
 * appears once a debt is tracked.
 *
 * Mirrors `budgetingAppliesTo` in @workspace/db's budget-sections, which the
 * server uses to seed a new budget's sections. The phone cannot import that
 * package without pulling drizzle into the bundle, so the rule is stated in
 * both places and held together by a test.
 */
export function budgetingAppliesTo(goal: BudgetGoal | null | undefined): boolean {
  return goal !== "saving" && goal !== "debt";
}

export const BUDGET_GOALS: Record<BudgetGoal, { title: string; description: string }> = {
  budgeting: {
    title: "Keeping track of spending",
    description: "Where the money goes each month, and staying inside a plan.",
  },
  saving: {
    title: "Saving towards something",
    description: "Building up an amount for a goal, with spending in service of it.",
  },
  debt: {
    title: "Paying off debt",
    description: "Clearing a loan or advance, and seeing the date it ends.",
  },
};

/**
 * Categories a debt-led budget starts from. Deliberately the kinds of debt
 * people in Kenya actually carry, not a generic "Loan" — a name somebody
 * recognises is a name they will keep.
 */
export const DEBT_ONBOARDING_CATEGORIES = [
  "Bank loan",
  "Sacco loan",
  "Chama advance",
  "Mobile loan",
  "Shylock",
  "Credit card",
  "Family debt",
] as const;

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
  /** Monthly amounts against a category's subcategories, as plain KES
   *  strings: `{ Food: { Groceries: "8000" } }`. A category with
   *  subcategories is planned through them, so `categoryBudgets` is not read
   *  for it. Absent on drafts saved before subcategories were asked. */
  subcategoryBudgets?: Record<string, Record<string, string>>;
  /** Subcategories somebody added themselves on the amounts step, by
   *  category: how a custom category gets anywhere to put an amount. */
  customSubcategories?: Record<string, string[]>;
  selectedIncomeStreams: string[];
  incomeAmounts: Record<string, string>;
  /** For a group: what each member is expected to contribute per month, as a
   *  plain KES string. Applied as the group's default contribution target. */
  memberContribution?: string;
  /** How many people the group expects, as a plain string. A guess, not an
   *  enforced cap — it only steers what Jamvi recommends. */
  expectedMemberCount?: string;
  /** What this budget is mainly for. Null until asked, and null on every
   *  budget made before the question existed. */
  budgetGoal?: BudgetGoal | null;
  /** For a debt-led budget: what is owed on each chosen debt category, as a
   *  plain KES string. These become tracked debts rather than plain
   *  categories, which is what gives the Debt tab something to show. */
  debtBalances?: Record<string, string>;
  /** Whether the person runs a business or side hustle. Null until asked,
   *  and on every draft made before the question existed. */
  runsBusiness?: boolean | null;
  /** What the business is called, as typed. Blank becomes "My business". */
  businessName?: string;
  /** Any other businesses they run, as typed: somebody with a shop and a
   *  boda names both here rather than finding My businesses later. */
  moreBusinessNames?: string[];
};

/** How many businesses onboarding takes; more are added on the Business screen. */
export const MAX_ONBOARDING_BUSINESSES = 5;

/**
 * The costs a business set up in onboarding starts with, and where each sits
 * on its profit and loss.
 *
 * A business on the Business screen is an income stream with categories
 * linked to it as costs. Linking was only possible from Reports → Income
 * streams → Cost categories, which a shopkeeper will never find, so somebody
 * who said "I run a business" still met "No business set up yet". Asking
 * once, here, and linking these to the business is what makes the profit and
 * loss work from the first sale.
 *
 * Stock is what the things sold cost, so it comes off sales first; supplies
 * and the general business line are the cost of running it.
 */
export const BUSINESS_COST_CATEGORIES: ReadonlyArray<{ name: string; costKind: "cogs" | "expense" }> = [
  { name: "Stock & inventory", costKind: "cogs" },
  { name: "Business supplies", costKind: "expense" },
  { name: "Work & business", costKind: "expense" },
];

/** Ticked for somebody who says they run a business. The third line stays
 *  on offer, unticked: not every business has one. */
export const BUSINESS_PRESELECTED_CATEGORIES = ["Stock & inventory", "Business supplies"] as const;

/** The generic income option a named business replaces. */
export const GENERIC_BUSINESS_INCOME_STREAM = "Business or side hustle";

export function isBusinessCostCategory(category: string): boolean {
  const normalized = normalizeCategoryName(category);
  return BUSINESS_COST_CATEGORIES.some((item) => normalizeCategoryName(item.name) === normalized);
}

/** The business's name as it will be saved, or null when there is no business. */
export function businessNameFromDraft(draft: Pick<MobileOnboardingDraft, "usageMode" | "runsBusiness" | "businessName">): string | null {
  if (draft.usageMode === "shared" || draft.runsBusiness !== true) return null;
  const name = (draft.businessName ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  return name || "My business";
}

/**
 * Every business to set up, the first one (the business-name box) first.
 * Blank extra boxes and a name typed twice are dropped. Only the first gets
 * the starter costs - a cost category belongs to one business - so the
 * others start with sales only and their costs are set on the Business screen.
 */
export function businessNamesFromDraft(draft: Pick<MobileOnboardingDraft, "usageMode" | "runsBusiness" | "businessName" | "moreBusinessNames">): string[] {
  const first = businessNameFromDraft(draft);
  if (!first) return [];
  const names = [first];
  for (const raw of draft.moreBusinessNames ?? []) {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!name || names.some((existing) => existing.toLowerCase() === name.toLowerCase())) continue;
    names.push(name);
    if (names.length >= MAX_ONBOARDING_BUSINESSES) break;
  }
  return names;
}

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
    categories: ["Health", "Education", "Books & supplies", "Family support", "Loans", "Emergencies", "Personal care", "Insurance"],
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
    categories: ["Entertainment", "Dates & activities", "Events", "Events & programs", "Equipment", "Venue", "Clothing", "Gifts", "Member welfare", "Welfare & benevolence", "Building & upkeep", "Outreach & missions", "Projects", "Tithe & giving", "Other"],
  },
] as const;

/**
 * What each category is for, in a line, where the names alone overlap ("Work
 * & business", "Business supplies" and "Stock & inventory" read as the same
 * thing - "there is a lot of confusion here", 5 Oct 2026).
 */
export const CATEGORY_HINTS: Readonly<Record<string, string>> = {
  Food: "Groceries, market shopping and eating out.",
  Housing: "Rent, or a mortgage, and service charge.",
  Utilities: "Electricity tokens, water, gas and rubbish collection.",
  "Shared bills": "Bills split with the people you live with.",
  Transport: "Fare, fuel, boda boda and parking.",
  Health: "Hospital, clinic, medicine and NHIF/SHA.",
  Education: "School fees, uniform, trips and tuition.",
  "Books & supplies": "Books, stationery and other things for school.",
  "Family support": "Money you send to parents, siblings or relatives.",
  Loans: "Paying back a loan: bank, Sacco, Fuliza, M-Shwari or a friend.",
  Emergencies: "Unplanned costs you had to pay: a sudden hospital bill, a repair. Money set aside for emergencies is a Goal instead.",
  "Personal care": "Salon, barber, toiletries and cosmetics.",
  Insurance: "Cover you pay for: medical, car, life or property.",
  "Airtime & data": "Airtime, bundles and home internet.",
  Household: "Cleaning things, repairs and house help.",
  Subscriptions: "DStv, Netflix, Showmax, Spotify and the like.",
  "Work & business": "What earning your living costs you: tools, a work phone, permits, a shop's rent.",
  "Business supplies": "Things your business uses up, not sells: packaging, receipt books, cleaning.",
  "Stock & inventory": "Goods you buy to sell on.",
  Entertainment: "Outings, games, shows and hobbies.",
  "Dates & activities": "Going out together.",
  Events: "Weddings, funerals, parties and harambees you give to.",
  "Events & programs": "The group's own meetings, functions and programmes.",
  Equipment: "Things the group buys and keeps.",
  Venue: "Hiring a place to meet or hold an event.",
  Clothing: "Clothes and shoes.",
  Gifts: "Presents for others.",
  "Member welfare": "Support for members in need: bereavement, illness.",
  "Welfare & benevolence": "Helping people in need.",
  "Building & upkeep": "Building, repairs and maintenance.",
  "Outreach & missions": "Outreach work and missions.",
  Projects: "A project the group is paying for.",
  "Tithe & giving": "Tithe, offerings and other giving.",
  Other: "Anything that fits nowhere else.",
};

/**
 * The subcategories the amounts step opens a category into.
 *
 * Amounts are set against subcategories only; a category never takes one of
 * its own and shows what its subcategories add up to (5 Oct 2026: "amount to
 * only be with subcategories, parents to only have grand total of children").
 * That is the same rule the Budget screen applies afterwards, where a
 * category with subcategories is a heading. So every category offered
 * anywhere in onboarding is listed here; a custom one gets a field to add
 * its own.
 *
 * Every name is unique across the whole map and distinct from every category
 * onboarding offers, because a budget's category names are unique: a
 * subcategory sharing a name with a category somebody also picked would have
 * nowhere to go. Loans avoids "Bank loan" and the like for the same reason -
 * those are the debt categories.
 */
export const ONBOARDING_SUBCATEGORIES: Readonly<Record<string, readonly string[]>> = {
  Food: ["Groceries", "Market shopping", "Eating out"],
  Housing: ["Rent", "Mortgage", "Service charge"],
  Utilities: ["Electricity", "Water", "Cooking gas", "Garbage collection"],
  "Shared bills": ["Rent share", "Bills share", "Shopping share"],
  Transport: ["Matatu & bus", "Fuel", "Boda boda", "Parking"],
  Health: ["Hospital & clinic", "Medicine", "SHA contributions"],
  Education: ["School fees", "Uniform", "School trips", "Tuition"],
  "Books & supplies": ["Books", "Stationery"],
  "Family support": ["Parents", "Siblings", "Other relatives"],
  Loans: ["Loan repayments", "Loan interest"],
  Emergencies: ["Medical emergencies", "Urgent repairs"],
  "Personal care": ["Salon & barber", "Toiletries", "Cosmetics"],
  Insurance: ["Medical cover", "Car insurance", "Life cover"],
  "Airtime & data": ["Airtime", "Data bundles", "Home internet"],
  Household: ["Cleaning supplies", "House repairs", "House help"],
  Subscriptions: ["Pay TV", "Streaming & music"],
  "Work & business": ["Tools", "Work phone", "Permits & licences", "Shop rent"],
  "Business supplies": ["Packaging", "Receipt books", "Business cleaning"],
  "Stock & inventory": ["Stock purchases", "Stock transport"],
  Entertainment: ["Outings", "Games & shows", "Hobbies"],
  "Dates & activities": ["Date nights", "Day trips"],
  Events: ["Weddings", "Funerals", "Parties", "Harambees"],
  "Events & programs": ["Meetings", "Functions"],
  Equipment: ["Equipment purchases", "Equipment repairs"],
  Venue: ["Venue hire", "Venue deposit"],
  Clothing: ["Clothes", "Shoes"],
  Gifts: ["Birthday gifts", "Holiday gifts", "Other gifts"],
  "Member welfare": ["Bereavement", "Illness support"],
  "Welfare & benevolence": ["Needy support", "Benevolence fund"],
  "Building & upkeep": ["Building repairs", "Cleaning", "Security"],
  "Outreach & missions": ["Missions", "Community outreach"],
  Projects: ["Project materials", "Project labour"],
  "Tithe & giving": ["Tithe", "Offerings", "Donations"],
  Other: ["Miscellaneous"],
  // A wedding's own categories.
  Catering: ["Food & drinks", "Cake"],
  Attire: ["Wedding gown", "Suits", "Bridal party outfits"],
  "Photography & video": ["Photographer", "Videographer"],
  Decor: ["Flowers", "Decorations"],
  "Invitations & stationery": ["Invitation cards", "Wedding programmes"],
  // A student group's own categories.
  "School fees & classes": ["Class fees", "Exam fees"],
  Meals: ["Lunch", "Snacks"],
  "Events & activities": ["Trips", "Competitions"],
  Welfare: ["Emergency help"],
  Administration: ["Office supplies", "Meeting costs"],
};

/** The subcategories a category opens into on the amounts step: Jamvi's own
 *  list, then any the person added. */
export function onboardingSubcategoriesFor(
  category: string,
  draft?: Pick<MobileOnboardingDraft, "customSubcategories">,
): string[] {
  const listed = ONBOARDING_SUBCATEGORIES[canonicalCategoryName(category)] ?? [];
  const added = draft?.customSubcategories?.[category] ?? [];
  // Not dedupeCategoryNames: that folds aliases, and "Groceries" is a
  // subcategory of Food here, not another name for it.
  const seen = new Set<string>();
  return [...listed, ...added].filter((name) => {
    const key = normalizeCategoryName(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const parseAmount = (value: string | undefined) => Math.max(0, Math.round(Number(value ?? 0) || 0));

/**
 * What a category is planned at: its subcategories added up. A category has
 * no amount of its own.
 */
export function plannedCategoryAmount(
  draft: Pick<MobileOnboardingDraft, "subcategoryBudgets" | "customSubcategories">,
  category: string,
): number {
  const amounts = draft.subcategoryBudgets?.[category] ?? {};
  return onboardingSubcategoriesFor(category, draft).reduce((sum, child) => sum + parseAmount(amounts[child]), 0);
}

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

/**
 * The shared-group kind implied by what somebody already said in onboarding.
 *
 * The two lists ask the same question in different words: onboarding asks who
 * the budget is for, and creating the group then asks again as "kind". Saying
 * "a couple" and then being asked to choose between Family, Chama, Club and
 * the rest reads as the app not having listened.
 *
 * A couple and a group of roommates both land on `family`, which the kind list
 * itself defines as "family members or housemates" — there is no separate
 * couple kind, and inventing one would change what every budget of that kind
 * already means.
 */
const PERSONA_TO_GROUP_KIND: Record<string, string> = {
  couple: "family",
  friends: "family",
  family: "family",
  chama: "chama",
  church: "church",
  club: "club",
  student_group: "student_group",
  other: "other",
};

/**
 * What to preselect as the group kind, or null when onboarding said nothing
 * that implies one — in which case the question is still worth asking.
 */
export function groupKindForPersona(persona: string | null | undefined): string | null {
  if (!persona) return null;
  return PERSONA_TO_GROUP_KIND[persona] ?? null;
}

const PURPOSE_CATEGORY_MAP: Record<string, readonly string[]> = {
  student: ["Food", "Housing", "Transport", "Education", "Books & supplies", "Airtime & data", "Subscriptions", "Personal care", "Entertainment", "Emergencies", "Other"],
  working: ["Food", "Housing", "Utilities", "Transport", "Health", "Education", "Family support", "Loans", "Emergencies", "Insurance", "Airtime & data", "Subscriptions", "Personal care", "Entertainment", "Tithe & giving", "Other"],
  business: ["Food", "Housing", "Utilities", "Transport", "Health", "Education", "Family support", "Work & business", "Business supplies", "Stock & inventory", "Loans", "Emergencies", "Airtime & data", "Tithe & giving", "Other"],
  couple: ["Food", "Housing", "Shared bills", "Utilities", "Transport", "Health", "Education", "Family support", "Loans", "Emergencies", "Airtime & data", "Dates & activities", "Other"],
  couple_wedding: ["Venue", "Catering", "Attire", "Photography & video", "Decor", "Invitations & stationery", "Gifts", "Transport", "Other"],
  friends: ["Food", "Housing", "Shared bills", "Utilities", "Transport", "Entertainment", "Dates & activities", "Airtime & data", "Emergencies", "Other"],
  family: ["Food", "Housing", "Utilities", "Transport", "Health", "Education", "Family support", "Loans", "Emergencies", "Insurance", "Household", "Airtime & data", "Other"],
  chama: ["Member welfare", "Loans", "Events", "Transport", "Projects", "Other"],
  church: ["Building & upkeep", "Utilities", "Outreach & missions", "Welfare & benevolence", "Events & programs", "Equipment", "Transport", "Other"],
  club: ["Member welfare", "Events", "Equipment", "Venue", "Transport", "Projects", "Entertainment", "Other"],
  student_group: ["School fees & classes", "Books & supplies", "Meals", "Transport", "Airtime & data", "Events & activities", "Welfare", "Administration"],
};

const ONBOARDING_DRAFT_STORAGE_PREFIX = "jamvi:onboarding-draft:";

export function onboardingDraftStorageKey(userId: string): string {
  return `${ONBOARDING_DRAFT_STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

export function recommendedCategoriesForPurpose(purpose: string | null, coupleStage: CoupleStage | null = null, runsBusiness = false): string[] {
  const key = purpose === "couple" && coupleStage === "wedding" ? "couple_wedding" : purpose;
  const usual = key ? (PURPOSE_CATEGORY_MAP[key] ?? ALL_ONBOARDING_CATEGORIES) : ALL_ONBOARDING_CATEGORIES;
  // A student or employee with a side business still needs its costs offered.
  return dedupeCategoryNames(runsBusiness ? [...usual, ...BUSINESS_COST_CATEGORIES.map((item) => item.name)] : usual);
}

/**
 * The categories offered first, given what the budget is for.
 *
 * A debt-led budget leads with debts and keeps the ordinary ones underneath —
 * somebody clearing a loan still eats. Every other goal is unchanged, so the
 * question costs nothing to anyone who does not pick debt.
 */
export function recommendedCategoriesForGoal(
  goal: BudgetGoal | null | undefined,
  persona: string | null,
  coupleStage: CoupleStage | null = null,
): string[] {
  const usual = recommendedCategoriesForPurpose(persona, coupleStage);
  if (goal !== "debt") return usual;
  return dedupeCategoryNames([...DEBT_ONBOARDING_CATEGORIES, ...usual]);
}

/** True for a category this onboarding offers as a debt rather than a spend. */
export function isDebtOnboardingCategory(category: string): boolean {
  const normalized = normalizeCategoryName(category);
  return DEBT_ONBOARDING_CATEGORIES.some((item) => normalizeCategoryName(item) === normalized);
}

/**
 * The debt categories a draft actually chose, with the balance entered against
 * each. Only these become tracked debts; a debt category picked without a
 * balance is still just a category, because a debt with no balance has nothing
 * to count down.
 */
export function trackedDebtsFromDraft(
  draft: Pick<MobileOnboardingDraft, "selectedCategories" | "debtBalances" | "budgetGoal">,
): Array<{ name: string; balance: number }> {
  if (draft.budgetGoal !== "debt") return [];
  const balances = draft.debtBalances ?? {};
  return draft.selectedCategories
    .filter((category) => isDebtOnboardingCategory(category))
    .map((category) => ({ name: category, balance: Number(balances[canonicalCategoryName(category)] ?? balances[category] ?? "") }))
    .filter((row) => Number.isFinite(row.balance) && row.balance > 0);
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
  const budgetGoal = raw.budgetGoal === "budgeting" || raw.budgetGoal === "saving" || raw.budgetGoal === "debt"
    ? raw.budgetGoal
    : null;
  const debtBalances = raw.debtBalances && typeof raw.debtBalances === "object"
    ? Object.entries(raw.debtBalances as Record<string, unknown>).reduce<Record<string, string>>((result, [name, amount]) => {
      if (typeof amount === "string") result[canonicalCategoryName(name)] = amount;
      return result;
    }, {})
    : {};
  const coupleStage = raw.coupleStage === "together" || raw.coupleStage === "wedding" ? raw.coupleStage : null;
  const runsBusiness = typeof raw.runsBusiness === "boolean" ? raw.runsBusiness : null;
  const selectedCategories = dedupeCategoryNames(raw.selectedCategories.filter((item): item is string => typeof item === "string"));
  const recommendedCategories = recommendedCategoriesForPurpose(persona, coupleStage, runsBusiness === true);
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
  const subcategoryBudgets = raw.subcategoryBudgets && typeof raw.subcategoryBudgets === "object"
    ? Object.entries(raw.subcategoryBudgets as Record<string, unknown>).reduce<Record<string, Record<string, string>>>((result, [name, amounts]) => {
      if (!amounts || typeof amounts !== "object") return result;
      const children = Object.entries(amounts as Record<string, unknown>).reduce<Record<string, string>>((kept, [child, amount]) => {
        if (typeof amount === "string") kept[child] = amount;
        return kept;
      }, {});
      result[canonicalCategoryName(name)] = { ...(result[canonicalCategoryName(name)] ?? {}), ...children };
      return result;
    }, {})
    : {};
  const customSubcategories = raw.customSubcategories && typeof raw.customSubcategories === "object"
    ? Object.entries(raw.customSubcategories as Record<string, unknown>).reduce<Record<string, string[]>>((result, [name, children]) => {
      if (!Array.isArray(children)) return result;
      const kept = children.filter((child): child is string => typeof child === "string" && child.trim().length > 0).map((child) => child.trim());
      if (kept.length > 0) result[canonicalCategoryName(name)] = kept;
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
    subcategoryBudgets,
    customSubcategories,
    selectedIncomeStreams: dedupeIncomeStreamNames(raw.selectedIncomeStreams.filter((item): item is string => typeof item === "string")),
    incomeAmounts: raw.incomeAmounts && typeof raw.incomeAmounts === "object" ? raw.incomeAmounts as Record<string, string> : {},
    memberContribution: typeof raw.memberContribution === "string" ? raw.memberContribution.replace(/[^0-9]/g, "") : "",
    expectedMemberCount: typeof raw.expectedMemberCount === "string" ? raw.expectedMemberCount.replace(/[^0-9]/g, "") : "",
    budgetGoal,
    debtBalances,
    runsBusiness,
    businessName: typeof raw.businessName === "string" ? raw.businessName.slice(0, 80) : "",
    moreBusinessNames: Array.isArray(raw.moreBusinessNames)
      ? raw.moreBusinessNames.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 80)).slice(0, MAX_ONBOARDING_BUSINESSES - 1)
      : [],
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
