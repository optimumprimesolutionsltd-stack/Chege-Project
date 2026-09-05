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
  return kind && Object.prototype.hasOwnProperty.call(CATEGORY_PACKS, kind)
    ? kind as GroupKind
    : "family";
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