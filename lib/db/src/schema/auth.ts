import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessionsTable = pgTable(
  'sessions',
  {
    sid: varchar('sid').primaryKey(),
    sess: jsonb('sess').notNull(),
    expire: timestamp('expire').notNull(),
  },
  (table) => [index('IDX_session_expire').on(table.expire)],
);

// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const usersTable = pgTable('users', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: varchar('email').unique(),
  // Null for existing/provider-only accounts; populated only for email-password accounts.
  passwordHash: varchar('password_hash'),
  // A name explicitly chosen in Jamvi. Unlike OIDC claims, it is never
  // overwritten when the person signs in again with Google.
  preferredName: varchar('preferred_name'),
  firstName: varchar('first_name'),
  lastName: varchar('last_name'),
  profileImageUrl: varchar('profile_image_url'),
  // A photo chosen in Jamvi takes precedence over the picture supplied by the
  // sign-in provider, which may change whenever the person signs in again.
  customProfilePhotoPath: varchar('custom_profile_photo_path'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type UpsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;

/**
 * One-time links for resetting a forgotten password.
 *
 * Only the hash of the token is stored, never the token itself. A leaked
 * database backup is then not a set of working password-reset links, which it
 * would be if the raw value were kept — the same reasoning as group invite
 * links.
 *
 * Rows are kept after use rather than deleted, so a support question about a
 * reset can be answered, and so a token cannot be replayed by anyone who
 * captured the email.
 */
export const passwordResetTokensTable = pgTable(
  'password_reset_tokens',
  {
    id: varchar('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: varchar('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Set the moment a token is spent. A second attempt then finds it used
     *  rather than valid, so a link in a forwarded email is worthless. */
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('password_reset_tokens_user_idx').on(table.userId),
    index('password_reset_tokens_expires_idx').on(table.expiresAt),
  ],
);

export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;
