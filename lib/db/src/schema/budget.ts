import { pgTable, serial, text, integer, boolean, date, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Budget categories (seeded, not user-managed)
export const budgetCategoriesTable = pgTable("budget_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  budgetAmount: integer("budget_amount").notNull(),
  priority: integer("priority").notNull().default(1),
  color: text("color").notNull().default("#6B7280"),
});

export const insertBudgetCategorySchema = createInsertSchema(budgetCategoriesTable).omit({ id: true });
export type InsertBudgetCategory = z.infer<typeof insertBudgetCategorySchema>;
export type BudgetCategory = typeof budgetCategoriesTable.$inferSelect;

// Expenses
export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  amount: integer("amount").notNull(), // in KES
  category: text("category").notNull(),
  description: text("description").notNull(),
  notes: text("notes"),                          // optional extra notes
  paidById: text("paid_by_id").notNull(),
  isRecurring: boolean("is_recurring").notNull().default(false),
  date: date("date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;

// Contributions (monthly deposits into joint account)
export const contributionsTable = pgTable("contributions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  amount: integer("amount").notNull(), // in KES
  month: integer("month").notNull(), // 1-12
  year: integer("year").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertContributionSchema = createInsertSchema(contributionsTable).omit({ id: true, createdAt: true });
export type InsertContribution = z.infer<typeof insertContributionSchema>;
export type Contribution = typeof contributionsTable.$inferSelect;

// Members — the two users allowed to access this app
export const membersTable = pgTable("members", {
  userId: text("user_id").primaryKey(),
  addedByUserId: text("added_by_user_id"),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export type Member = typeof membersTable.$inferSelect;

// Digest send log — one row per (month, year) prevents duplicate emails
// across concurrent or restarted server instances.
export const digestSendsTable = pgTable(
  "digest_sends",
  {
    id: serial("id").primaryKey(),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    emailId: text("email_id"),
    recipients: text("recipients").array(),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (t) => [unique("digest_sends_month_year_unique").on(t.month, t.year)],
);

export type DigestSend = typeof digestSendsTable.$inferSelect;
