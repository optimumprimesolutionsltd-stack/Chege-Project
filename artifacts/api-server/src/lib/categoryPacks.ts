import type { GroupKind } from "@workspace/db";

export type CategoryPackItem = {
  name: string;
  budgetAmount: number;
  priority: number;
  color: string;
  /**
   * Suggested mini-ledgers inside this category.
   *
   * Named for what people actually pay for here - garbage, the watchman,
   * matatu fare, school trips - rather than for accounting tidiness. Nobody
   * budgets for "Waste management services".
   *
   * They carry no amount. A suggestion has no business inventing a figure for
   * somebody else's electricity, and a ledger with no target still tracks
   * spending perfectly well.
   */
  children?: readonly string[];
};

export type PriorityTierItem = {
  priority: number;
  label: string;
  description: string;
};

const HOUSEHOLD_PRIORITY_TIERS: readonly PriorityTierItem[] = [
  { priority: 1, label: "Survival Essentials", description: "Must-pay basics such as food, housing, and core utilities." },
  { priority: 2, label: "Health & Education", description: "Health, learning, and other costs that should not be delayed." },
  { priority: 3, label: "Daily Household", description: "Transport, supplies, and the costs that keep daily life running." },
  { priority: 4, label: "Connectivity & Care", description: "Communication, grooming, and similar regular costs." },
  { priority: 5, label: "Flexible Spending", description: "Spending that can wait when money is limited." },
];

const ORGANISATION_PRIORITY_TIERS: Record<Exclude<GroupKind, "personal" | "family">, readonly PriorityTierItem[]> = {
  chama: [
    { priority: 1, label: "Core Commitments", description: "Projects, meetings, and obligations the Chama must fund first." },
    { priority: 2, label: "Welfare & Administration", description: "Member welfare and the costs of running the Chama." },
    { priority: 3, label: "Operations & Transport", description: "Practical costs that keep group activities moving." },
    { priority: 4, label: "Communication & Growth", description: "Communication, outreach, and development activities." },
    { priority: 5, label: "Flexible Spending", description: "Optional costs that can wait when funds are limited." },
  ],
  church: [
    { priority: 1, label: "Ministry & Worship", description: "Services, ministry, and the work the church exists to do." },
    { priority: 2, label: "Welfare & Benevolence", description: "Helping members and the community in need." },
    { priority: 3, label: "Building & Upkeep", description: "The building, its utilities, and keeping it in good order." },
    { priority: 4, label: "Outreach & Growth", description: "Missions, events, and reaching beyond the congregation." },
    { priority: 5, label: "Flexible Spending", description: "Costs that can wait when giving is low." },
  ],
  club: [
    { priority: 1, label: "Core Activities", description: "Events and activities central to the club." },
    { priority: 2, label: "Venue & Membership", description: "Member participation and places where the club meets." },
    { priority: 3, label: "Administration", description: "Operating costs that keep the club organised." },
    { priority: 4, label: "Equipment & Growth", description: "Equipment, outreach, and development activities." },
    { priority: 5, label: "Flexible Spending", description: "Optional costs that can wait when funds are limited." },
  ],
  team: [
    { priority: 1, label: "Core Operations", description: "Salaries, tools, and obligations the team must fund first." },
    { priority: 2, label: "Delivery & Travel", description: "Costs directly supporting the team's work." },
    { priority: 3, label: "Training & Support", description: "Learning and support costs that strengthen the team." },
    { priority: 4, label: "Growth", description: "Improvements and expansion that can follow core work." },
    { priority: 5, label: "Flexible Spending", description: "Optional costs that can wait when funds are limited." },
  ],
  student_group: [
    { priority: 1, label: "Academic Commitments", description: "Fees, classes, books, and required learning costs." },
    { priority: 2, label: "Student Welfare", description: "Meals, emergency help, health, and member support." },
    { priority: 3, label: "Group Operations", description: "Transport, communication, administration, and coordination." },
    { priority: 4, label: "Activities & Growth", description: "Events, projects, competitions, and development." },
    { priority: 5, label: "Flexible Spending", description: "Optional costs that can wait when funds are limited." },
  ],
  other: [
    { priority: 1, label: "Core Commitments", description: "The group's most important obligations." },
    { priority: 2, label: "Operations", description: "Services and costs that keep the group running." },
    { priority: 3, label: "Transport & Support", description: "Practical support costs for group activities." },
    { priority: 4, label: "Growth", description: "Improvements and expansion after core commitments." },
    { priority: 5, label: "Flexible Spending", description: "Optional costs that can wait when funds are limited." },
  ],
};

/**
 * Expense categories suggested for each workspace purpose. These are deliberately
 * only expense buckets: income and contributions belong to their own ledgers.
 */
export const CATEGORY_PACKS: Record<GroupKind, readonly CategoryPackItem[]> = {
  personal: [
    { name: "Food", budgetAmount: 0, priority: 1, color: "#F97316", children: ["Groceries", "Supermarket", "Eating out"] },
    { name: "Housing", budgetAmount: 0, priority: 1, color: "#F59E0B", children: ["Rent", "Service charge", "Repairs"] },
    { name: "Transport", budgetAmount: 0, priority: 2, color: "#8B5CF6", children: ["Matatu & bus", "Fuel", "Boda"] },
    { name: "Health", budgetAmount: 0, priority: 2, color: "#EF4444", children: ["Clinic visits", "Medicine", "Insurance"] },
    { name: "Utilities", budgetAmount: 0, priority: 2, color: "#EAB308", children: ["Electricity", "Water", "Wi-Fi", "Garbage", "Security"] },
    { name: "Personal care", budgetAmount: 0, priority: 3, color: "#DB2777", children: ["Salon & barber", "Toiletries"] },
  ],
  family: [
    { name: "Food", budgetAmount: 0, priority: 1, color: "#F97316", children: ["Groceries", "Supermarket", "Milk & bread"] },
    { name: "Housing", budgetAmount: 0, priority: 1, color: "#F59E0B", children: ["Rent", "Service charge", "Repairs"] },
    { name: "Utilities", budgetAmount: 0, priority: 1, color: "#EAB308", children: ["Electricity", "Water", "Wi-Fi", "Garbage", "Security"] },
    { name: "Health", budgetAmount: 0, priority: 2, color: "#EF4444", children: ["Clinic visits", "Medicine", "Insurance"] },
    { name: "Education", budgetAmount: 0, priority: 2, color: "#3B82F6", children: ["School fees", "School trips", "Uniforms", "Books & stationery"] },
    { name: "Transport", budgetAmount: 0, priority: 3, color: "#8B5CF6", children: ["Matatu & bus", "Fuel", "School run"] },
  ],
  chama: [
    { name: "Meetings", budgetAmount: 0, priority: 1, color: "#F97316", children: ["Venue", "Refreshments"] },
    { name: "Projects", budgetAmount: 0, priority: 1, color: "#2563EB", children: ["Materials", "Labour", "Permits"] },
    { name: "Welfare", budgetAmount: 0, priority: 2, color: "#DB2777", children: ["Bereavement", "Medical help", "Celebrations"] },
    { name: "Administration", budgetAmount: 0, priority: 2, color: "#6B7280", children: ["Bank charges", "Stationery", "Airtime"] },
    { name: "Transport", budgetAmount: 0, priority: 3, color: "#8B5CF6", children: ["Fares", "Fuel"] },
  ],
  church: [
    { name: "Ministry", budgetAmount: 0, priority: 1, color: "#7C3AED", children: ["Services", "Music & worship", "Sunday school"] },
    { name: "Welfare", budgetAmount: 0, priority: 2, color: "#DB2777", children: ["Bereavement", "Medical help", "Benevolence"] },
    { name: "Building & upkeep", budgetAmount: 0, priority: 3, color: "#F59E0B", children: ["Repairs", "Cleaning", "Security"] },
    { name: "Utilities", budgetAmount: 0, priority: 3, color: "#EAB308", children: ["Electricity", "Water", "Wi-Fi"] },
    { name: "Outreach", budgetAmount: 0, priority: 4, color: "#059669", children: ["Missions", "Community events"] },
    { name: "Administration", budgetAmount: 0, priority: 4, color: "#6B7280", children: ["Stationery", "Bank charges"] },
  ],
  club: [
    { name: "Events", budgetAmount: 0, priority: 1, color: "#F97316", children: ["Catering", "Publicity", "Decor"] },
    { name: "Equipment", budgetAmount: 0, priority: 1, color: "#2563EB", children: ["Purchases", "Repairs"] },
    { name: "Venue", budgetAmount: 0, priority: 2, color: "#F59E0B", children: ["Hire", "Cleaning"] },
    { name: "Membership activities", budgetAmount: 0, priority: 2, color: "#059669", children: ["Trips", "Competitions"] },
    { name: "Administration", budgetAmount: 0, priority: 3, color: "#6B7280", children: ["Bank charges", "Stationery"] },
  ],
  team: [
    { name: "Salaries", budgetAmount: 0, priority: 1, color: "#2563EB", children: ["Wages", "Statutory deductions"] },
    { name: "Tools", budgetAmount: 0, priority: 1, color: "#7C3AED", children: ["Software", "Hardware"] },
    { name: "Operations", budgetAmount: 0, priority: 2, color: "#059669", children: ["Office rent", "Internet", "Airtime"] },
    { name: "Travel", budgetAmount: 0, priority: 2, color: "#8B5CF6", children: ["Fares", "Accommodation", "Per diem"] },
    { name: "Training", budgetAmount: 0, priority: 3, color: "#3B82F6", children: ["Courses", "Materials"] },
  ],
  student_group: [
    { name: "School fees & classes", budgetAmount: 0, priority: 1, color: "#2563EB", children: ["Tuition", "Exam fees"] },
    { name: "Books & supplies", budgetAmount: 0, priority: 1, color: "#7C3AED", children: ["Textbooks", "Stationery", "Printing"] },
    { name: "Meals", budgetAmount: 0, priority: 2, color: "#F97316", children: ["Lunch", "Snacks"] },
    { name: "Transport", budgetAmount: 0, priority: 3, color: "#8B5CF6", children: ["Fares", "Field trips"] },
    { name: "Airtime & data", budgetAmount: 0, priority: 3, color: "#0891B2", children: ["Bundles", "Calls"] },
    { name: "Events & activities", budgetAmount: 0, priority: 4, color: "#DB2777", children: ["School trips", "Competitions"] },
    { name: "Welfare", budgetAmount: 0, priority: 2, color: "#059669", children: ["Emergency help"] },
    { name: "Administration", budgetAmount: 0, priority: 3, color: "#6B7280", children: ["Bank charges", "Meeting costs"] },
  ],
  other: [
    { name: "Supplies", budgetAmount: 0, priority: 1, color: "#F97316", children: ["Consumables", "Equipment"] },
    { name: "Operations", budgetAmount: 0, priority: 1, color: "#059669", children: ["Rent", "Utilities"] },
    { name: "Transport", budgetAmount: 0, priority: 2, color: "#8B5CF6", children: ["Fares", "Fuel"] },
    { name: "Services", budgetAmount: 0, priority: 2, color: "#2563EB", children: ["Professional fees", "Subscriptions"] },
  ],
};

export function categoryPackForKind(kind: string | null | undefined): readonly CategoryPackItem[] {
  return CATEGORY_PACKS[normalizedCategoryPackKind(kind)];
}

export function priorityTiersForKind(kind: string | null | undefined): readonly PriorityTierItem[] {
  const normalized = normalizedCategoryPackKind(kind);
  return normalized === "personal" || normalized === "family"
    ? HOUSEHOLD_PRIORITY_TIERS
    : ORGANISATION_PRIORITY_TIERS[normalized];
}

export function normalizedCategoryPackKind(kind: string | null | undefined): GroupKind {
  // Falls back to "other", never to "family".
  //
  // Household categories - groceries, rent, wi-fi, garbage - belong to a
  // couple or an individual, and to nobody else. Defaulting an unrecognised
  // kind to family meant any group the map did not know suggested Rent and
  // Groceries to a chama or a congregation, and the household priority tiers
  // with them. "Other" is deliberately generic: supplies, operations,
  // transport, services, which is wrong for nobody.
  //
  // This also makes adding a kind safe. A new kind whose pack is forgotten now
  // gets neutral suggestions rather than somebody else's shopping list.
  return kind && Object.prototype.hasOwnProperty.call(CATEGORY_PACKS, kind)
    ? kind as GroupKind
    : "other";
}

export function categoryPackRows(groupId: number, kind: string | null | undefined) {
  // `children` is a suggestion, not a column. Spreading the pack item whole
  // would hand drizzle a field the table does not have.
  return categoryPackForKind(kind).map(({ children: _children, ...category }) => ({
    ...category,
    groupId,
    isRecurring: true,
    activeMonth: null,
    activeYear: null,
  }));
}

/** Suggested mini-ledgers, as parent name to child names. Every name is unique
 *  within a pack, because a category name is unique within a budget. */
export function categoryPackChildren(
  kind: string | null | undefined,
): ReadonlyMap<string, readonly string[]> {
  return new Map(
    categoryPackForKind(kind)
      .filter((category) => category.children?.length)
      .map((category) => [category.name, category.children as readonly string[]]),
  );
}

export interface ExistingCategoryShape {
  id: number;
  name: string;
  parentId: number | null;
}

export interface SubcategorySuggestions {
  /** Kind is personal or family — the only kinds this tidy-up runs for. */
  applicable: boolean;
  /** Top-level categories whose name matches a standard child. `parentName`
   *  may not exist in the budget yet; it is created when the move is applied. */
  matched: Array<{ categoryId: number; categoryName: string; parentName: string }>;
  /** Other top-level categories that are neither a standard parent nor a
   *  standard child — the person picks a parent, or leaves them where they are. */
  unparented: Array<{ categoryId: number; categoryName: string }>;
  /** Every current top-level category, for the "move under" picker. */
  parentOptions: Array<{ id: number; name: string }>;
}

/**
 * Which existing categories in a household budget could be tucked under a
 * parent.
 *
 * Household budgets (a person or a couple) are where a flat list of forty rows
 * defeats the point of categories. A category the pack already knows as a
 * child - "Wi-Fi", "Rent", "School fees" - sitting at the top level is matched
 * to its standard parent. Anything else at the top level that is not itself a
 * standard parent is offered with a picker. Categories that already have
 * children of their own are left alone: nesting is one level deep.
 *
 * Pure so the matching can be tested without a database.
 */
export function subcategorySuggestions(
  kind: string | null | undefined,
  categories: ExistingCategoryShape[],
  reservedName?: string,
): SubcategorySuggestions {
  const normalizedKind = normalizedCategoryPackKind(kind);
  if (normalizedKind !== "personal" && normalizedKind !== "family") {
    return { applicable: false, matched: [], unparented: [], parentOptions: [] };
  }

  const norm = (value: string) => value.trim().toLocaleLowerCase("en-US");
  const reserved = reservedName ? norm(reservedName) : null;
  const pack = categoryPackForKind(normalizedKind);
  const packParentNames = new Set(pack.map((item) => norm(item.name)));
  const childToParent = new Map<string, string>();
  for (const parent of pack) {
    for (const child of parent.children ?? []) childToParent.set(norm(child), parent.name);
  }

  const parentIdsInUse = new Set<number>();
  for (const category of categories) {
    if (category.parentId != null) parentIdsInUse.add(category.parentId);
  }

  const topLevel = categories.filter((category) => category.parentId == null);
  const parentOptions = topLevel
    .filter((category) => norm(category.name) !== reserved)
    .map((category) => ({ id: category.id, name: category.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const matched: SubcategorySuggestions["matched"] = [];
  const unparented: SubcategorySuggestions["unparented"] = [];

  for (const category of topLevel) {
    const name = norm(category.name);
    if (name === reserved) continue;
    if (parentIdsInUse.has(category.id)) continue; // already a parent
    if (packParentNames.has(name)) continue; // a standard parent — leave it

    const parentName = childToParent.get(name);
    if (parentName && norm(parentName) !== name) {
      matched.push({ categoryId: category.id, categoryName: category.name, parentName });
    } else {
      unparented.push({ categoryId: category.id, categoryName: category.name });
    }
  }

  return { applicable: true, matched, unparented, parentOptions };
}