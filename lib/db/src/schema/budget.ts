import { pgTable, serial, text, integer, numeric, boolean, date, timestamp, index, unique, uniqueIndex, check, foreignKey, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { groupsTable } from "./groups";

// Workspace-owned bank accounts. Legacy ledger history is attached to a
// workspace account during migration, while users can personalize its name.
export const bankAccountsTable = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  accountNumber: text("account_number"),
  openingBalance: numeric("opening_balance", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
  openingBalanceDate: date("opening_balance_date", { mode: "string" }),
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
  // A sub-category: the mini-ledger inside a bigger one, so that Groceries can
  // accumulate a month of small purchases under Food without Food losing its
  // single budget figure.
  //
  // The parent keeps the budget. A child's budgetAmount is a target within it
  // and may be 0, which means "track this, do not judge it" - the right answer
  // for something like Groceries that varies month to month. Spending is
  // tracked either way: it comes from the expenses tagged to the category, not
  // from this column.
  //
  // Restricted rather than cascading. Deleting Utilities should not silently
  // take Wi-Fi, Garbage and Security with it, along with the only record of
  // what those cost.
  parentId: integer("parent_id").references((): AnyPgColumn => budgetCategoriesTable.id, { onDelete: "restrict" }),
  priority: integer("priority").notNull().default(1),
  color: text("color").notNull().default("#6B7280"),
  // Archived categories remain available to historical reports and expenses,
  // but are removed from new budget and expense choices.
  isArchived: boolean("is_archived").notNull().default(false),
  isRecurring: boolean("is_recurring").notNull().default(true),
  activeMonth: integer("active_month"),
  activeYear: integer("active_year"),
}, (table) => [
  check(
    "budget_categories_name_valid_check",
    sql`btrim(${table.name}) <> '' AND char_length(${table.name}) <= 80`,
  ),
  uniqueIndex("budget_categories_group_name_normalized_unique")
    .on(table.groupId, sql`lower(btrim(${table.name}))`),
  index("budget_categories_group_priority_idx").on(table.groupId, table.priority),
  index("budget_categories_parent_idx").on(table.parentId),
  // One level only is enforced in the route, which can give a usable message.
  // This catches the case no message helps with.
  check("budget_categories_parent_not_self_check", sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`),
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
  // backfilled to the workspace bank account.
  accountId: integer("account_id").references(() => bankAccountsTable.id, { onDelete: "restrict" }),
  isRecurring: boolean("is_recurring").notNull().default(false),
  date: date("date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("expenses_group_date_idx").on(table.groupId, table.date),
  unique("expenses_id_group_unique").on(table.id, table.groupId),
]);

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true });
export type InsertExpense = typeof expensesTable.$inferInsert;
export type Expense = typeof expensesTable.$inferSelect;

// Category portions for a single expense. The parent expense keeps its
// original category as the compatibility/display primary category; this table
// is the source of truth when an expense is allocated across categories.
export const expenseCategoryAllocationsTable = pgTable("expense_category_allocations", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "restrict" }),
  expenseId: integer("expense_id").notNull(),
  category: text("category").notNull(),
  amount: integer("amount").notNull(), // in KES
  position: integer("position").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("expense_category_allocations_expense_position_unique").on(table.expenseId, table.position),
  index("expense_category_allocations_group_expense_idx").on(table.groupId, table.expenseId),
  index("expense_category_allocations_group_category_idx").on(table.groupId, table.category),
  foreignKey({
    columns: [table.expenseId, table.groupId],
    foreignColumns: [expensesTable.id, expensesTable.groupId],
    name: "expense_category_allocations_expense_group_fk",
  }).onDelete("cascade"),
]);
export type ExpenseCategoryAllocation = typeof expenseCategoryAllocationsTable.$inferSelect;

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
/**
 * Everybody who puts money into a group, whether or not they use the app.
 *
 * Every group that collects money already keeps a spreadsheet: names down the
 * side, dates across the top. A row there is a person, not an account - a
 * church of two hundred will never all sign in, and a chama usually has one
 * member without a smartphone. So a contributor is a person in a group, and
 * the link to a Jamvi account is optional: it decides only whether they can
 * sign in and see their own row.
 */
export const groupContributorsTable = pgTable("group_contributors", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  /** Null for somebody who does not use the app. */
  userId: text("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  /** What this person is expected to give in a period, in KES. Null means no
   *  expectation - right for a church, where giving is not a subscription.
   *  It is the default when recording for the whole group at once, and what
   *  "who still owes" is measured against. */
  monthlyTarget: integer("monthly_target"),
  /** Archived rather than deleted: somebody who has left still contributed
   *  what they contributed, and removing them would make last year's totals
   *  disagree with last year's rows. */
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (table) => [
  check(
    "group_contributors_name_valid_check",
    sql`btrim(${table.name}) <> '' AND char_length(${table.name}) <= 120`,
  ),
  // Names are deliberately not unique: two people really can both be called
  // John, and refusing the second is worse than showing both.
  uniqueIndex("group_contributors_group_user_unique")
    .on(table.groupId, table.userId)
    .where(sql`${table.userId} IS NOT NULL`),
  index("group_contributors_group_idx").on(table.groupId),
]);

export type GroupContributor = typeof groupContributorsTable.$inferSelect;

export const contributionsTable = pgTable("contributions", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "restrict" }),
  /** Null for a contribution recorded against somebody with no account. Kept
   *  alongside contributorId so every existing report keeps working. */
  userId: text("user_id"),
  contributorId: integer("contributor_id").references(() => groupContributorsTable.id, { onDelete: "restrict" }),
  amount: integer("amount").notNull(), // in KES
  month: integer("month").notNull(), // 1-12
  year: integer("year").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("contributions_group_year_month_idx").on(table.groupId, table.year, table.month),
  index("contributions_group_contributor_idx").on(table.groupId, table.contributorId),
]);

export const insertContributionSchema = createInsertSchema(contributionsTable).omit({ id: true, createdAt: true });
export type InsertContribution = typeof contributionsTable.$inferInsert;
export type Contribution = typeof contributionsTable.$inferSelect;

// Merry-go-round: each round the pot is paid out to one member in turn. The
// recipient is chosen by the treasurer, so this table is the record of who has
// received and in what order — there is no fixed rotation stored anywhere.
// Recording a payout also writes a joint-account disbursement (transactionId),
// so the bank balance and this history stay in step.
export const groupPayoutsTable = pgTable("group_payouts", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "restrict" }),
  contributorId: integer("contributor_id").notNull().references(() => groupContributorsTable.id, { onDelete: "restrict" }),
  /** The bank disbursement this payout created. Null only for a payout imported
   *  or recorded before the money moved. */
  transactionId: integer("transaction_id").references(() => jointAccountTxTable.id, { onDelete: "set null" }),
  /** 1-based, assigned in order per group. */
  roundNumber: integer("round_number").notNull(),
  amount: integer("amount").notNull(), // in KES
  date: date("date", { mode: "string" }).notNull(),
  note: text("note"),
  recordedByUserId: text("recorded_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("group_payouts_group_round_idx").on(table.groupId, table.roundNumber),
  uniqueIndex("group_payouts_group_round_unique").on(table.groupId, table.roundNumber),
]);

export type GroupPayout = typeof groupPayoutsTable.$inferSelect;

// Joint Account Transactions — deposits and disbursements from the shared pool
export const jointAccountTxTable = pgTable("joint_account_transactions", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "restrict" }),
  type: text("type").notNull(), // 'deposit' | 'disbursement'
  amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(), // in KES
  description: text("description").notNull(),
  madeById: text("made_by_id"), // userId for deposits; null ok for disbursements
  incomeSourceId: integer("income_source_id"), // which income source funded this deposit
  expenseCategory: text("expense_category"), // optional: which expense category this disbursement covers
  bankCharge: boolean("bank_charge").notNull().default(false), // true for a bank fee/charge, excluded from household spending reports
  savingsGoalId: integer("savings_goal_id"), // set only for a linked bank <-> savings transfer
  accountId: integer("account_id").references(() => bankAccountsTable.id, { onDelete: "restrict" }),
  transferDirection: text("transfer_direction"), // 'to_savings' | 'from_savings' for linked transfers
  // Two rows share this token for an internal bank-to-bank transfer. The
  // counterparty account makes each account history understandable on its own.
  bankTransferId: text("bank_transfer_id"),
  bankTransferAccountId: integer("bank_transfer_account_id").references(() => bankAccountsTable.id, { onDelete: "restrict" }),
  // Set for the Joint-bank portion of a single split-funded expense. The
  // expense route owns this ledger row so both records stay in sync.
  expenseId: integer("expense_id").references(() => expensesTable.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("joint_account_transactions_group_date_idx").on(table.groupId, table.date),
  index("joint_account_transactions_bank_transfer_idx").on(table.groupId, table.bankTransferId),
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
  /** Null when the money came from somebody without an account. The deposit
   *  splits carry the same contributor concept as contributions, because a
   *  deposit is how money actually reaches the group balance. */
  userId: text("user_id"),
  contributorId: integer("contributor_id").references(() => groupContributorsTable.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull(),
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
