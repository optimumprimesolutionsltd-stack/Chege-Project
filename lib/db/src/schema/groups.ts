import { createInsertSchema } from "drizzle-zod";
import {
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
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