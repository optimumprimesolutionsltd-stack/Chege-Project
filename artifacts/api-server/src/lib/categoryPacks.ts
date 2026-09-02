import type { GroupKind } from "@workspace/db";

export type CategoryPackItem = {
  name: string;
  budgetAmount: number;
  priority: number;
  color: string;
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
    { name: "Food", budgetAmount: 0, priority: 1, color: "#F97316" },
    { name: "Housing", budgetAmount: 0, priority: 1, color: "#F59E0B" },
    { name: "Transport", budgetAmount: 0, priority: 2, color: "#8B5CF6" },
    { name: "Health", budgetAmount: 0, priority: 2, color: "#EF4444" },
    { name: "Utilities", budgetAmount: 0, priority: 2, color: "#EAB308" },
    { name: "Personal care", budgetAmount: 0, priority: 3, color: "#DB2777" },
  ],
  family: [
    { name: "Food", budgetAmount: 0, priority: 1, color: "#F97316" },
    { name: "Housing", budgetAmount: 0, priority: 1, color: "#F59E0B" },
    { name: "Utilities", budgetAmount: 0, priority: 1, color: "#EAB308" },
    { name: "Health", budgetAmount: 0, priority: 2, color: "#EF4444" },
    { name: "Education", budgetAmount: 0, priority: 2, color: "#3B82F6" },
    { name: "Transport", budgetAmount: 0, priority: 3, color: "#8B5CF6" },
  ],
  chama: [
    { name: "Meetings", budgetAmount: 0, priority: 1, color: "#F97316" },
    { name: "Projects", budgetAmount: 0, priority: 1, color: "#2563EB" },
    { name: "Welfare", budgetAmount: 0, priority: 2, color: "#DB2777" },
    { name: "Administration", budgetAmount: 0, priority: 2, color: "#6B7280" },
    { name: "Transport", budgetAmount: 0, priority: 3, color: "#8B5CF6" },
  ],
  club: [
    { name: "Events", budgetAmount: 0, priority: 1, color: "#F97316" },
    { name: "Equipment", budgetAmount: 0, priority: 1, color: "#2563EB" },
    { name: "Venue", budgetAmount: 0, priority: 2, color: "#F59E0B" },
    { name: "Membership activities", budgetAmount: 0, priority: 2, color: "#059669" },
    { name: "Administration", budgetAmount: 0, priority: 3, color: "#6B7280" },
  ],
  team: [
    { name: "Salaries", budgetAmount: 0, priority: 1, color: "#2563EB" },
    { name: "Tools", budgetAmount: 0, priority: 1, color: "#7C3AED" },
    { name: "Operations", budgetAmount: 0, priority: 2, color: "#059669" },
    { name: "Travel", budgetAmount: 0, priority: 2, color: "#8B5CF6" },
    { name: "Training", budgetAmount: 0, priority: 3, color: "#3B82F6" },
  ],
  other: [
    { name: "Supplies", budgetAmount: 0, priority: 1, color: "#F97316" },
    { name: "Operations", budgetAmount: 0, priority: 1, color: "#059669" },
    { name: "Transport", budgetAmount: 0, priority: 2, color: "#8B5CF6" },
    { name: "Services", budgetAmount: 0, priority: 2, color: "#2563EB" },
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
  return categoryPackForKind(kind).map((category) => ({
    ...category,
    groupId,
    isRecurring: true,
    activeMonth: null,
    activeYear: null,
  }));
}