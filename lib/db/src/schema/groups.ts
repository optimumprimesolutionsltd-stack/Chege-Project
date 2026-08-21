import { createInsertSchema } from "drizzle-zod";
import {
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const GROUP_ROLE = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
} as const;

export type GroupRole = (typeof GROUP_ROLE)[keyof typeof GROUP_ROLE];

export const groupsTable = pgTable(
  "groups",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    // Used exactly once to adopt the existing shared ledger without relying on
    // a personal name or a client-provided group identifier.
    legacyKey: text("legacy_key").unique(),
    // A personal workspace belongs to exactly one person. Shared workspaces
    // leave this unset, so their owner can still create more than one group.
    privateOwnerUserId: text("private_owner_user_id").unique(),
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