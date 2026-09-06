-- Contributors who are people, and contributions that happened on a day.
--
-- Every group that collects money already keeps a spreadsheet: names down the
-- side, dates across the top, totals at the bottom. Two things stopped Jamvi
-- being that sheet.
--
-- A row had to be a Jamvi account. A chama of twenty can manage that; a church
-- of two hundred cannot, and neither can a chama where one member has no
-- smartphone. So a contributor is now a person in a group, and linking them to
-- an account is optional - the link only decides whether they can sign in and
-- see it themselves.
--
-- The month is the unit that matters. What a group asks is whether a member
-- has done this month, not which day the money arrived, so month and year stay
-- exactly as they are and no date column is added. If per-Sunday detail is
-- ever wanted, that is one nullable column and a later migration.
--
-- Purely additive. Existing rows are backfilled, nothing is dropped, and every
-- current read keeps working on user_id.

CREATE TABLE IF NOT EXISTS "group_contributors" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"name" text NOT NULL,
	-- Null for somebody who does not use the app. The treasurer records for
	-- them, and they are a name in the ledger like anybody else.
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	-- Archived rather than deleted: somebody who has left still contributed
	-- what they contributed, and removing them would make last year's totals
	-- disagree with last year's rows.
	"archived_at" timestamp with time zone
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "group_contributors"
		ADD CONSTRAINT "group_contributors_group_id_groups_id_fk"
		FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "group_contributors"
		ADD CONSTRAINT "group_contributors_user_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "group_contributors"
		ADD CONSTRAINT "group_contributors_name_valid_check"
		CHECK (btrim("name") <> '' AND char_length("name") <= 120);
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- One contributor per account per group. Names are deliberately NOT unique:
-- two people really can both be called John, and refusing the second is worse
-- than showing both.
CREATE UNIQUE INDEX IF NOT EXISTS "group_contributors_group_user_unique"
	ON "group_contributors" ("group_id", "user_id") WHERE "user_id" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "group_contributors_group_idx"
	ON "group_contributors" ("group_id");
--> statement-breakpoint

ALTER TABLE "contributions" ADD COLUMN IF NOT EXISTS "contributor_id" integer;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "contributions"
		ADD CONSTRAINT "contributions_contributor_id_group_contributors_id_fk"
		FOREIGN KEY ("contributor_id") REFERENCES "public"."group_contributors"("id") ON DELETE restrict;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- A contribution from somebody without an account has no user to point at.
ALTER TABLE "contributions" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint

-- Everybody who has ever contributed becomes a contributor.
INSERT INTO "group_contributors" ("group_id", "name", "user_id")
SELECT DISTINCT ON (c."group_id", c."user_id")
	c."group_id",
	COALESCE(NULLIF(btrim(u."first_name"), ''), 'Member'),
	c."user_id"
FROM "contributions" c
LEFT JOIN "users" u ON u."id" = c."user_id"
WHERE c."group_id" IS NOT NULL
	AND c."user_id" IS NOT NULL
	AND NOT EXISTS (
		SELECT 1 FROM "group_contributors" gc
		WHERE gc."group_id" = c."group_id" AND gc."user_id" = c."user_id"
	);
--> statement-breakpoint

-- And so does every current member, so the grid opens with the whole group
-- rather than only those who have already paid.
INSERT INTO "group_contributors" ("group_id", "name", "user_id")
SELECT
	gm."group_id",
	COALESCE(NULLIF(btrim(u."first_name"), ''), 'Member'),
	gm."user_id"
FROM "group_memberships" gm
LEFT JOIN "users" u ON u."id" = gm."user_id"
WHERE NOT EXISTS (
	SELECT 1 FROM "group_contributors" gc
	WHERE gc."group_id" = gm."group_id" AND gc."user_id" = gm."user_id"
);
--> statement-breakpoint

UPDATE "contributions" c
SET "contributor_id" = gc."id"
FROM "group_contributors" gc
WHERE gc."group_id" = c."group_id"
	AND gc."user_id" = c."user_id"
	AND c."contributor_id" IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "contributions_group_contributor_idx"
	ON "contributions" ("group_id", "contributor_id");
--> statement-breakpoint

-- Deposit splits carry the same contributor concept, because a deposit is how
-- money actually reaches the group balance. Without this a contribution from
-- somebody with no account could be recorded but never banked.
ALTER TABLE "joint_account_deposit_splits" ADD COLUMN IF NOT EXISTS "contributor_id" integer;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "joint_account_deposit_splits"
		ADD CONSTRAINT "joint_account_deposit_splits_contributor_id_fk"
		FOREIGN KEY ("contributor_id") REFERENCES "public"."group_contributors"("id") ON DELETE restrict;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

ALTER TABLE "joint_account_deposit_splits" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint

UPDATE "joint_account_deposit_splits" s
SET "contributor_id" = gc."id"
FROM "group_contributors" gc
WHERE gc."group_id" = s."group_id" AND gc."user_id" = s."user_id" AND s."contributor_id" IS NULL;
--> statement-breakpoint

-- What this person is expected to give in a period.
--
-- The common case at a meeting is that everybody paid the usual amount, so the
-- treasurer should start from that and subtract the two who did not, rather
-- than type forty identical figures. This is also what "who still owes" is
-- measured against. Null means no expectation, which is right for a church
-- where giving is not a subscription.
ALTER TABLE "group_contributors" ADD COLUMN IF NOT EXISTS "monthly_target" integer;
--> statement-breakpoint

UPDATE "group_contributors" gc
SET "monthly_target" = gm."monthly_target"
FROM "group_memberships" gm
WHERE gm."group_id" = gc."group_id"
	AND gm."user_id" = gc."user_id"
	AND gc."monthly_target" IS NULL;
