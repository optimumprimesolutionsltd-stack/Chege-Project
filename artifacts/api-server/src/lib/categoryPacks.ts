import type { GroupKind } from "@workspace/db";

export type CategoryPackItem = {
  name: string;
  budgetAmount: number;
  priority: number;
  color: string;
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