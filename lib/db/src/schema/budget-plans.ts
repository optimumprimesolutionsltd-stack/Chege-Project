import { relations } from "drizzle-orm";
import { boolean, date, index, integer, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { groupsTable } from "./groups";
import { budgetCategoriesTable } from "./budget";
import { onboardingPreferencesTable } from "./onboarding";

export const onboardingCategorySelectionsTable = pgTable("onboarding_category_selections", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  onboardingPreferenceId: integer("onboarding_preference_id").notNull().references(() => onboardingPreferencesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  source: text("source").notNull().default("recommended"),
  priority: integer("priority").notNull().default(1),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("onboarding_category_selections_parent_name_unique").on(table.onboardingPreferenceId, table.name),
  index("onboarding_category_selections_parent_idx").on(table.onboardingPreferenceId),
]);

export const onboardingBudgetAllocationsTable = pgTable("onboarding_budget_allocations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  onboardingPreferenceId: integer("onboarding_preference_id").notNull().references(() => onboardingPreferencesTable.id, { onDelete: "cascade" }),
  categoryName: text("category_name").notNull(),
  plannedAmount: integer("planned_amount").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("onboarding_budget_allocations_parent_name_unique").on(table.onboardingPreferenceId, table.categoryName),
  index("onboarding_budget_allocations_parent_idx").on(table.onboardingPreferenceId),
]);

export const budgetPlansTable = pgTable("budget_plans", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
  createdByUserId: varchar("created_by_user_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  purpose: text("purpose"),
  durationType: text("duration_type").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("budget_plans_group_status_idx").on(table.groupId, table.status),
  index("budget_plans_group_dates_idx").on(table.groupId, table.startDate, table.endDate),
]);

export const budgetPlanCategoriesTable = pgTable("budget_plan_categories", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  budgetPlanId: integer("budget_plan_id").notNull().references(() => budgetPlansTable.id, { onDelete: "cascade" }),
  budgetCategoryId: integer("budget_category_id").references(() => budgetCategoriesTable.id, { onDelete: "set null" }),
  categoryName: text("category_name").notNull(),
  plannedAmount: integer("planned_amount").notNull().default(0),
  priority: integer("priority").notNull().default(1),
  isCustom: boolean("is_custom").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("budget_plan_categories_plan_name_unique").on(table.budgetPlanId, table.categoryName),
  index("budget_plan_categories_plan_idx").on(table.budgetPlanId),
]);

export const budgetPlansRelations = relations(budgetPlansTable, ({ one, many }) => ({
  group: one(groupsTable, { fields: [budgetPlansTable.groupId], references: [groupsTable.id] }),
  createdBy: one(usersTable, { fields: [budgetPlansTable.createdByUserId], references: [usersTable.id] }),
  categories: many(budgetPlanCategoriesTable),
}));

export const onboardingCategorySelectionsRelations = relations(onboardingCategorySelectionsTable, ({ one }) => ({
  preferences: one(onboardingPreferencesTable, { fields: [onboardingCategorySelectionsTable.onboardingPreferenceId], references: [onboardingPreferencesTable.id] }),
}));

export const onboardingBudgetAllocationsRelations = relations(onboardingBudgetAllocationsTable, ({ one }) => ({
  preferences: one(onboardingPreferencesTable, { fields: [onboardingBudgetAllocationsTable.onboardingPreferenceId], references: [onboardingPreferencesTable.id] }),
}));

export const budgetPlanCategoriesRelations = relations(budgetPlanCategoriesTable, ({ one }) => ({
  plan: one(budgetPlansTable, { fields: [budgetPlanCategoriesTable.budgetPlanId], references: [budgetPlansTable.id] }),
  category: one(budgetCategoriesTable, { fields: [budgetPlanCategoriesTable.budgetCategoryId], references: [budgetCategoriesTable.id] }),
}));

export type OnboardingCategorySelection = typeof onboardingCategorySelectionsTable.$inferSelect;
export type OnboardingBudgetAllocation = typeof onboardingBudgetAllocationsTable.$inferSelect;
export type BudgetPlan = typeof budgetPlansTable.$inferSelect;
export type BudgetPlanCategory = typeof budgetPlanCategoriesTable.$inferSelect;
