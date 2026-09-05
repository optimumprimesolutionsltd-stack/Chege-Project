-- Which reminders have already gone out.
--
-- The lifecycle job runs daily and will be re-run by hand after a failure, so
-- "have we already said this?" is answered by the database rather than by
-- hoping the job runs exactly once. The unique index is the whole mechanism.
--
-- sent_for is the date the reminder is about, not the day it was sent, so a
-- renewal a year later is a new row rather than a duplicate.

CREATE TABLE IF NOT EXISTS "subscription_reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"sent_for" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "subscription_reminders" ADD CONSTRAINT "subscription_reminders_user_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_reminders_once_idx"
	ON "subscription_reminders" USING btree ("user_id","kind","sent_for");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscription_reminders_user_idx"
	ON "subscription_reminders" USING btree ("user_id");
