import { pgTable, serial, text, integer, boolean, date, timestamp, index, unique } from "drizzle-orm/pg-core";
import { groupsTable } from "./groups";

// Workspace-owned bank accounts. Every legacy workspace receives a "Main
// account" during migration, so bank ledger history always has an account.
export const bankAccountsTable = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  openingBalance: integer("opening_balance").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("bank_accounts_group_name_unique").on(table.groupId, table.name),
  index("bank_accounts_group_id_idx").on(table.groupId),
]);

export const insertBankAccountSchema = createInsertSchema(bankAccountsTable).omit({ id: true, createdAt: true });
export type InsertBankAccount = typeof bankAccountsTable.$inferInsert;
export type BankAccount = typeof bankAccountsTable.$inferSelect;

// Income sources — per-person named income streams (e.g. Lydiah–EISH, Chege–Salary)
export const incomeSourcesTable = pgTable("income_sources", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "restrict" }),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  isMain: boolean("is_main").notNull().default(false),
  expectedMonthlyAmount: integer("expected_monthly_amount").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("income_sources_group_user_id_idx").on(table.groupId, table.userId),
]);

export const insertIncomeSourceSchema = createInsertSchema(incomeSourcesTable).omit({ id: true, createdAt: true });
export type InsertIncomeSource = typeof incomeSourcesTable.$inferInsert;
export type IncomeSource = typeof incomeSourcesTable.$inferSelect;
import { createInsertSchema } from "drizzle-zod";

// Budget categories (seeded, not user-managed)
export const budgetCategoriesTable = pgTable("budget_categories", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  budgetAmount: integer("budget_amount").notNull(),
  priority: integer("priority").notNull().default(1),
  color: text("color").notNull().default("#6B7280"),
  isRecurring: boolean("is_recurring").notNull().default(true),
  activeMonth: integer("active_month"),
  activeYear: integer("active_year"),
}, (table) => [
  unique("budget_categories_group_name_unique").on(table.groupId, table.name),
  index("budget_categories_group_priority_idx").on(table.groupId, table.priority),
]);

export const insertBudgetCategorySchema = createInsertSchema(budgetCategoriesTable).omit({ id: true });
export type InsertBudgetCategory = typeof budgetCategoriesTable.$inferInsert;
export type BudgetCategory = typeof budgetCategoriesTable.$inferSelect;

// Expenses
export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "restrict" }),
  amount: integer("amount").notNull(), // in KES
  category: text("category").notNull(),
  description: text("description").notNull(),
  notes: text("notes"),                          // optional extra notes
  // Legacy single-payer attribution. Split-funded expenses use
  // expenseIncomeSplitsTable as the source of truth, so a fully Joint-bank
  // expense has no named payer here.
  paidById: text("paid_by_id"),
  incomeSourceId: integer("income_source_id"),
  paidFromBank: boolean("paid_from_bank").notNull().default(false), // true = funded from joint account deposit (already counted as contribution)
  // Required for newly created bank-funded expenses; legacy history is
  // backfilled to the workspace Main account.
  accountId: integer("account_id").references(() => bankAccountsTable.id, { onDelete: "restrict" }),
  isRecurring: boolean("is_recurring").notNull().default(false),
  date: date("date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("expenses_group_date_idx").on(table.groupId, table.date),
]);

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true });
export type InsertExpense = typeof expensesTable.$inferInsert;
export type Expense = typeof expensesTable.$inferSelect;

// Per-expense funding splits — when money comes from multiple sources for one payment
export const expenseIncomeSplitsTable = pgTable("expense_income_splits", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "restrict" }),
  expenseId: integer("expense_id").notNull().references(() => expensesTable.id, { onDelete: "cascade" }),
  // userId is null only when fromBank is true. label remains for readable
  // legacy history, while userId is the durable attribution used in reports.
  userId: text("user_id"),
  label: text("label").notNull(),       // e.g. "Chege", "Joint bank"
  amount: integer("amount").notNull(),  // in KES
  incomeSourceId: integer("income_source_id"),
  fromBank: boolean("from_bank").notNull().default(false), // true = this portion is funded by the shared Joint bank
  accountId: integer("account_id").references(() => bankAccountsTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("expense_income_splits_group_expense_idx").on(table.groupId, table.expenseId),
]);
export type ExpenseIncomeSplit = typeof expenseIncomeSplitsTable.$inferSelect;

// Contributions (monthly deposits into joint account)
export const contributionsTable = pgTable("contributions", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "restrict" }),
  userId: text("user_id").notNull(),
  amount: integer("amount").notNull(), // in KES
  month: integer("month").notNull(), // 1-12
  year: integer("year").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("contributions_group_year_month_idx").on(table.groupId, table.year, table.month),
]);

export const insertContributionSchema = createInsertSchema(contributionsTable).omit({ id: true, createdAt: true });
export type InsertContribution = typeof contributionsTable.$inferInsert;
export type Contribution = typeof contributionsTable.$inferSelect;

// Joint Account Transactions — deposits and disbursements from the shared pool
export const jointAccountTxTable = pgTable("joint_account_transactions", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "restrict" }),
  type: text("type").notNull(), // 'deposit' | 'disbursement'
  amount: integer("amount").notNull(), // in KES
  description: text("description").notNull(),
  madeById: text("made_by_id"), // userId for deposits; null ok for disbursements
  incomeSourceId: integer("income_source_id"), // which income source funded this deposit
  expenseCategory: text("expense_category"), // optional: which expense category this disbursement covers
  savingsGoalId: integer("savings_goal_id"), // set only for a linked bank <-> savings transfer
  accountId: integer("account_id").references(() => bankAccountsTable.id, { onDelete: "restrict" }),
  transferDirection: text("transfer_direction"), // 'to_savings' | 'from_savings' for linked transfers
  // Set for the Joint-bank portion of a single split-funded expense. The
  // expense route owns this ledger row so both records stay in sync.
  expenseId: integer("expense_id").references(() => expensesTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("joint_account_transactions_group_date_idx").on(table.groupId, table.date),
]);

export const insertJointAccountTxSchema = createInsertSchema(jointAccountTxTable).omit({ id: true, createdAt: true });
export type InsertJointAccountTx = typeof jointAccountTxTable.$inferInsert;
export type JointAccountTx = typeof jointAccountTxTable.$inferSelect;

// Per-deposit contributor attribution. A deposit remains one bank ledger row,
// with these portions showing which household members supplied it.
export const jointAccountDepositSplitsTable = pgTable("joint_account_deposit_splits", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "restrict" }),
  transactionId: integer("transaction_id").notNull().references(() => jointAccountTxTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  amount: integer("amount").notNull(),
  incomeSourceId: integer("income_source_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("joint_account_deposit_splits_group_transaction_idx").on(table.groupId, table.transactionId),
]);
export type JointAccountDepositSplit = typeof jointAccountDepositSplitsTable.$inferSelect;

// Members — the household members allowed to access this app
export const membersTable = pgTable("members", {
  userId: text("user_id").primaryKey(),
  groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "restrict" }),
  addedByUserId: text("added_by_user_id"),
  addedAt: timestamp("added_at").defaultNow().notNull(),
  monthlyTarget: integer("monthly_target"),  // optional contribution target in KES; null = no target set
}, (table) => [
  index("members_group_id_idx").on(table.groupId),
]);

export type Member = typeof membersTable.$inferSelect;

// Digest send log — one row per (month, year) prevents duplicate emails
// across concurrent or restarted server instances.
export const digestSendsTable = pgTable(
  "digest_sends",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "restrict" }),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    emailId: text("email_id"),
    recipients: text("recipients").array(),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (t) => [
    unique("digest_sends_group_month_year_unique").on(t.groupId, t.month, t.year),
    index("digest_sends_group_id_idx").on(t.groupId),
  ],
);

export type DigestSend = typeof digestSendsTable.$inferSelect;

// Savings Goals
export const savingsGoalsTable = pgTable("savings_goals", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  targetAmount: integer("target_amount").notNull(), // in KES
  currentAmount: integer("current_amount").notNull().default(0), // in KES
  deadline: date("deadline"),
  createdByUserId: text("created_by_user_id").notNull(),
  isCompleted: boolean("is_completed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("savings_goals_group_created_at_idx").on(table.groupId, table.createdAt),
]);

export const insertSavingsGoalSchema = createInsertSchema(savingsGoalsTable).omit({ id: true, createdAt: true });
export type InsertSavingsGoal = typeof savingsGoalsTable.$inferInsert;
export type SavingsGoal = typeof savingsGoalsTable.$inferSelect;

// Savings Goal Contributions — one row per individual contribution
export const savingsGoalContributionsTable = pgTable("savings_goal_contributions", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "restrict" }),
  goalId: integer("goal_id").notNull().references(() => savingsGoalsTable.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(), // in KES; negative values indicate manual downward adjustments
  note: text("note"),                 // null for regular contributions; set for manual adjustments
  isBalanceCorrection: boolean("is_balance_correction").notNull().default(false),
  createdByUserId: text("created_by_user_id"),  // null = Joint bank (shared household); named = individual member
  bankTransactionId: integer("bank_transaction_id"), // links a bank <-> savings transfer for safe reversal
  accountId: integer("account_id").references(() => bankAccountsTable.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("savings_goal_contributions_group_goal_idx").on(table.groupId, table.goalId),
]);

export type SavingsGoalContribution = typeof savingsGoalContributionsTable.$inferSelect;
