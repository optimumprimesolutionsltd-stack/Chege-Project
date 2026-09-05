import { createInsertSchema } from "drizzle-zod";
import {
  index,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./auth";

export const GROUP_ROLE = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
  /**
   * Sees everything, records nothing.
   *
   * A chama has one treasurer and forty people who want to know the balance.
   * Making all forty pay to look is what stops the treasurer inviting them at
   * all, so a viewer costs nothing and never sees a paywall - the people who
   * record money are the ones who pay.
   */
  VIEWER: "viewer",
} as const;

export type GroupRole = (typeof GROUP_ROLE)[keyof typeof GROUP_ROLE];

// What kind of workspace this is. Personal and family workspaces are free;
// chamas and clubs are the chargeable tier. Recorded at creation so the
// distinction never has to be reconstructed for existing workspaces later.
export const GROUP_KIND = {
  PERSONAL: "personal",
  FAMILY: "family",
  CHAMA: "chama",
  CLUB: "club",
  TEAM: "team",
  STUDENT_GROUP: "student_group",
  OTHER: "other",
} as const;

export type GroupKind = (typeof GROUP_KIND)[keyof typeof GROUP_KIND];

// What a workspace is entitled to. Everything is free today; the column exists
// now so that introducing a paid tier is a value change rather than a
// migration against live financial data.
export const GROUP_PLAN = {
  FREE: "free",
  PAID: "paid",
} as const;

export type GroupPlan = (typeof GROUP_PLAN)[keyof typeof GROUP_PLAN];

// Shared budgets use a small, recognizable identity system rather than
// unrestricted uploads or colours. Defaults keep every existing workspace
// usable and visually consistent after the additive schema update.
export const DEFAULT_GROUP_ICON = "users";
export const DEFAULT_GROUP_ACCENT_COLOR = "#0F766E";
export const GROUP_NAME_STYLE = {
  PLAIN: "plain",
  ITALIC: "italic",
  BOLD: "bold",
  SERIF: "serif",
} as const;

export type GroupNameStyle = (typeof GROUP_NAME_STYLE)[keyof typeof GROUP_NAME_STYLE];

export const groupsTable = pgTable(
  "groups",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    icon: text("icon").notNull().default(DEFAULT_GROUP_ICON),
    accentColor: text("accent_color").notNull().default(DEFAULT_GROUP_ACCENT_COLOR),
    // Optional emoji gives each budget a quick, personal visual cue. The
    // existing icon remains the fallback for budgets without one.
    emoji: text("emoji"),
    nameStyle: text("name_style").notNull().default(GROUP_NAME_STYLE.PLAIN),
    // Group-owned image object path. The API resolves this private path to a
    // short-lived viewing URL only for a verified workspace member.
    photoPath: text("photo_path"),
    // A short, optional line displayed with the workspace identity. It belongs
    // to the workspace rather than a particular member, just like its photo.
    slogan: text("slogan"),
    // Used exactly once to adopt the existing shared ledger without relying on
    // a personal name or a client-provided group identifier.
    legacyKey: text("legacy_key").unique(),
    // A personal workspace belongs to exactly one person. Shared workspaces
    // leave this unset, so their owner can still create more than one group.
    privateOwnerUserId: text("private_owner_user_id").unique(),
    // Manually entered bank balance carried into the first recorded transaction.
    // This belongs to the workspace because the bank account is shared.
    bankOpeningBalance: integer("bank_opening_balance").notNull().default(0),
    // Defaults to family so existing rows keep the free tier on migration.
    // ensurePrivateWorkspace overrides this to "personal".
    kind: text("kind").notNull().default(GROUP_KIND.FAMILY),
    // Free until a paid tier exists. Member limits are only enforced on free
    // workspaces, so flipping this to paid lifts them.
    plan: text("plan").notNull().default(GROUP_PLAN.FREE),
    // What each member is expected to contribute per month, in KES. A chama
    // sets this when the workspace is created and every member who joins
    // inherits it as their own monthlyTarget.
    //
    // The dashboard and the monthly digest already show target against
    // contributed, but nothing ever set a target, so that comparison was
    // always empty. Null means the group does not work to a fixed amount -
    // families and one-off groups usually do not.
    defaultMonthlyTarget: integer("default_monthly_target"),
    // Workspace-specific names and explanations for the five budget priority
    // tiers. Null means the group-kind defaults are used.
    priorityTiers: jsonb("priority_tiers").$type<Array<{
      priority: number;
      label: string;
      description: string;
    }>>(),
    createdByUserId: text("created_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("groups_created_by_user_id_idx").on(table.createdByUserId)],
);

export const insertGroupSchema = createInsertSchema(groupsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertGroup = typeof groupsTable.$inferInsert;
export type Group = typeof groupsTable.$inferSelect;

export const subscriptionPlansTable = pgTable(
  "subscription_plans",
  {
    code: text("code").primaryKey(),
    displayName: text("display_name").notNull(),
    description: text("description").notNull(),
    audience: text("audience").notNull(),
    monthlyPriceKes: integer("monthly_price_kes").notNull(),
    annualPriceKes: integer("annual_price_kes").notNull(),
    currency: text("currency").notNull().default("KES"),
    memberLimit: integer("member_limit"),
    annualSavingKes: integer("annual_saving_kes"),
    featureEntitlements: jsonb("feature_entitlements").$type<string[]>().notNull().default([]),
    displayOrder: integer("display_order").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    recommended: boolean("recommended").notNull().default(false),
    personal: boolean("personal").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("subscription_plans_display_order_unique").on(table.displayOrder),
    index("subscription_plans_enabled_order_idx").on(table.enabled, table.displayOrder),
  ],
);

export const groupSubscriptionsTable = pgTable(
  "group_subscriptions",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groupsTable.id, { onDelete: "cascade" }),
    ownerAdminUserId: text("owner_admin_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    packageCode: text("package_code")
      .notNull()
      .references(() => subscriptionPlansTable.code, { onDelete: "restrict" }),
    billingInterval: text("billing_interval").notNull(),
    status: text("status").notNull().default("pending"),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("group_subscriptions_group_created_idx").on(table.groupId, table.createdAt),
    index("group_subscriptions_package_idx").on(table.packageCode),
    uniqueIndex("group_subscriptions_one_current_idx")
      .on(table.groupId)
      .where(sql`${table.status} IN ('trial', 'pending', 'active', 'past_due')`),
  ],
);

export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;
export type GroupSubscription = typeof groupSubscriptionsTable.$inferSelect;

/**
 * One subscription per member, not per group.
 *
 * Groups have no plan and no bill: a chama of fifty is fifty current members.
 * groupSubscriptionsTable above is the previous per-group model and is no
 * longer written to.
 */
export const userSubscriptionsTable = pgTable(
  "user_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    packageCode: text("package_code")
      .notNull()
      .references(() => subscriptionPlansTable.code, { onDelete: "restrict" }),
    billingInterval: text("billing_interval").notNull(),
    status: text("status").notNull().default("trial"),
    /** When the free period ends. Set once, at signup, and never moved. */
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    /** Set when a payment is missed. Past this, access drops to read-only. */
    graceEndsAt: timestamp("grace_ends_at", { withTimezone: true }),
    promoCode: text("promo_code"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("user_subscriptions_user_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("user_subscriptions_one_current_idx")
      .on(table.userId)
      .where(sql`${table.status} IN ('trial', 'pending', 'active', 'past_due')`),
  ],
);

/**
 * Discount codes, used instead of verifying who is a student.
 *
 * Every verification route costs more than the discount is worth: institutional
 * email covers a minority of Kenyan students, ID review needs a person, and
 * third-party checks charge per lookup with thin local coverage. Codes handed
 * to campus reps and chama secretaries verify by association, and double as a
 * way for the product to spread.
 */
export const promoCodesTable = pgTable(
  "promo_codes",
  {
    code: text("code").primaryKey(),
    description: text("description").notNull(),
    /** What a member pays per month while the code is applied. */
    monthlyPriceKes: integer("monthly_price_kes").notNull(),
    annualPriceKes: integer("annual_price_kes").notNull(),
    /** Null means no cap on how many members may use it. */
    maxRedemptions: integer("max_redemptions"),
    redemptions: integer("redemptions").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export type UserSubscription = typeof userSubscriptionsTable.$inferSelect;
export type PromoCode = typeof promoCodesTable.$inferSelect;

export const groupMembershipsTable = pgTable(
  "group_memberships",
  {
    groupId: integer("group_id")
      .notNull()
      .references(() => groupsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: text("role").notNull().default(GROUP_ROLE.MEMBER),
    addedByUserId: text("added_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    monthlyTarget: integer("monthly_target"),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    index("group_memberships_user_id_idx").on(table.userId),
  ],
);

export type GroupMembership = typeof groupMembershipsTable.$inferSelect;

export const groupInvitationsTable = pgTable(
  "group_invitations",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groupsTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default(GROUP_ROLE.MEMBER),
    tokenHash: text("token_hash").notNull().unique(),
    createdByUserId: text("created_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [
    index("group_invitations_group_id_idx").on(table.groupId),
    index("group_invitations_email_idx").on(table.groupId, table.email),
  ],
);

export type GroupInvitation = typeof groupInvitationsTable.$inferSelect;

/**
 * A private, shareable join link. The raw token is never stored, and the link
 * remains an access request rather than an authorization boundary: every
 * acceptance creates a verified membership before the group can be selected.
 */
export const groupInviteLinksTable = pgTable(
  "group_invite_links",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groupsTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    /** What the link grants: a member who can record, or a viewer who cannot.
     *  Every link created before view links existed is a member link. */
    role: text("role").notNull().default(GROUP_ROLE.MEMBER),
    /**
     * Optional second factor on a view link, hashed by the same scrypt path as
     * account passwords.
     *
     * A link travels badly - forwarded, quoted, screenshot - and keeps working
     * afterwards. A passphrase said out loud at a meeting does not travel with
     * it, so holding the URL stops being enough on its own.
     */
    passphraseHash: text("passphrase_hash"),
    createdByUserId: text("created_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("group_invite_links_group_id_idx").on(table.groupId),
    index("group_invite_links_token_hash_idx").on(table.tokenHash),
    index("group_invite_links_group_role_idx").on(table.groupId, table.role),
  ],
);

export type GroupInviteLink = typeof groupInviteLinksTable.$inferSelect;

export const groupInviteContactsTable = pgTable(
  "group_invite_contacts",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groupsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull().default(GROUP_ROLE.MEMBER),
    createdByUserId: text("created_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("group_invite_contacts_group_email_unique").on(table.groupId, table.email),
    index("group_invite_contacts_group_id_idx").on(table.groupId),
  ],
);

export type GroupInviteContact = typeof groupInviteContactsTable.$inferSelect;