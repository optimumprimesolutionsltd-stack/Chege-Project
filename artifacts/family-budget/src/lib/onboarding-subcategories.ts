/**
 * The subcategories onboarding's amounts step opens a category into.
 *
 * Amounts are set against subcategories only; a category never takes one of
 * its own and shows what its subcategories add up to (5 Oct 2026: "amount to
 * only be with subcategories, parents to only have grand total of children").
 * That is the rule the Budget page applies afterwards, where a category with
 * subcategories is a heading. A custom category gets a field to add its own.
 *
 * The same list as the phone's ONBOARDING_SUBCATEGORIES in
 * mobile-budget/lib/onboarding.ts, held together by a test. Every name is
 * unique and distinct from every category onboarding offers, because a
 * budget's category names are unique.
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

const normalized = (name: string) => name.trim().toLocaleLowerCase("en-US");

/** A category's subcategories: Jamvi's own list, then any the person added. */
export function onboardingSubcategoriesFor(category: string, customSubcategories: Record<string, string[]> = {}): string[] {
  const seen = new Set<string>();
  return [...(ONBOARDING_SUBCATEGORIES[category] ?? []), ...(customSubcategories[category] ?? [])].filter((name) => {
    const key = normalized(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const parseAmount = (value: string | undefined) => Math.max(0, Math.round(Number(value ?? 0) || 0));

/** What a category is planned at: its subcategories added up, never an amount of its own. */
export function plannedCategoryAmount(
  category: string,
  subcategoryBudgets: Record<string, Record<string, string>>,
  customSubcategories: Record<string, string[]> = {},
): number {
  const amounts = subcategoryBudgets[category] ?? {};
  return onboardingSubcategoriesFor(category, customSubcategories).reduce((sum, child) => sum + parseAmount(amounts[child]), 0);
}

/** The subcategories and amounts sent with a category to /budget-plans/onboarding. */
export function subcategoryPayload(
  category: string,
  subcategoryBudgets: Record<string, Record<string, string>>,
  customSubcategories: Record<string, string[]> = {},
): Array<{ name: string; plannedAmount: number }> {
  const amounts = subcategoryBudgets[category] ?? {};
  return onboardingSubcategoriesFor(category, customSubcategories).map((name) => ({ name, plannedAmount: parseAmount(amounts[name]) }));
}

/** Why a new subcategory name cannot be added, or null when it can. */
export function newSubcategoryError(name: string, selectedCategories: string[], customSubcategories: Record<string, string[]>): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Type a subcategory name first.";
  const key = normalized(trimmed);
  const taken = [...selectedCategories, ...selectedCategories.flatMap((category) => onboardingSubcategoriesFor(category, customSubcategories))];
  return taken.some((item) => normalized(item) === key) ? `${trimmed} is already in this plan.` : null;
}

/** Keeps only well-formed entries from a saved draft. */
export function readSubcategoryBudgets(value: unknown): Record<string, Record<string, string>> {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, Record<string, string>>>((result, [category, amounts]) => {
    if (!amounts || typeof amounts !== "object") return result;
    result[category] = Object.entries(amounts as Record<string, unknown>).reduce<Record<string, string>>((kept, [child, amount]) => {
      if (typeof amount === "string") kept[child] = amount;
      return kept;
    }, {});
    return result;
  }, {});
}

export function readCustomSubcategories(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string[]>>((result, [category, children]) => {
    if (!Array.isArray(children)) return result;
    const kept = children.filter((child): child is string => typeof child === "string" && child.trim().length > 0).map((child) => child.trim());
    if (kept.length > 0) result[category] = kept;
    return result;
  }, {});
}
