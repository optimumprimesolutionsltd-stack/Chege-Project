import { relations } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const onboardingPreferencesTable = pgTable("onboarding_preferences", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  usageMode: text("usage_mode").notNull(),
  persona: text("persona"),
  budgetDuration: text("budget_duration").notNull(),
  budgetStartDate: date("budget_start_date"),
  budgetEndDate: date("budget_end_date"),
  categoryNames: jsonb("category_names").$type<string[]>().notNull().default([]),
  incomeStreams: jsonb("income_streams").$type<string[]>().notNull().default([]),
  completed: boolean("completed").notNull().default(false),
  onboardingVersion: integer("onboarding_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("onboarding_preferences_user_id_unique").on(table.userId),
  index("onboarding_preferences_completed_idx").on(table.completed),
]);

export const onboardingPreferencesRelations = relations(onboardingPreferencesTable, ({ one }) => ({
  user: one(usersTable, { fields: [onboardingPreferencesTable.userId], references: [usersTable.id] }),
}));

export type OnboardingPreferences = typeof onboardingPreferencesTable.$inferSelect;
export type InsertOnboardingPreferences = typeof onboardingPreferencesTable.$inferInsert;