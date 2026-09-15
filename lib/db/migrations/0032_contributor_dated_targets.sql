-- What a contributor is expected to give, from a date onwards.
--
-- group_contributors.monthly_target is a single number with no history, so
-- changing it silently rewrote the past: raise a member from 500 to 1,000 and
-- last year's arrears were recalculated against 1,000, which they had never
-- owed. Each change is now its own dated row, and a month is measured against
-- whichever row was in force then.
--
-- No backfill. The old scalar remains the value for any month before a
-- contributor's first dated row, so existing groups keep the figures they
-- already had, and setting a dated amount deliberately leaves monthly_target
-- alone — that is what keeps the past intact.
--
-- A null amount ends an expectation from that date without deleting the
-- history behind it.

CREATE TABLE IF NOT EXISTS "group_contributor_targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"contributor_id" integer NOT NULL,
	"amount" integer,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "group_contributor_targets" ADD CONSTRAINT "group_contributor_targets_amount_check"
		CHECK ("amount" IS NULL OR "amount" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "group_contributor_targets" ADD CONSTRAINT "group_contributor_targets_group_id_groups_id_fk"
		FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "group_contributor_targets" ADD CONSTRAINT "group_contributor_targets_contributor_id_group_contributors_id_fk"
		FOREIGN KEY ("contributor_id") REFERENCES "public"."group_contributors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
-- One amount per person per day: setting it twice in a day is a correction,
-- not two facts, and the second replaces the first.
CREATE UNIQUE INDEX IF NOT EXISTS "group_contributor_targets_contributor_date_unique"
	ON "group_contributor_targets" USING btree ("contributor_id","effective_from");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_contributor_targets_contributor_idx"
	ON "group_contributor_targets" USING btree ("contributor_id","effective_from");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_contributor_targets_group_idx"
	ON "group_contributor_targets" USING btree ("group_id");
