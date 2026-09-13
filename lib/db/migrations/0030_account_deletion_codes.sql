-- One-time codes confirming an account-deletion request.
--
-- Only the hash is stored. Not marked unique the way password_reset_tokens'
-- hash is: a 6-digit code is not random enough for that - two different
-- members really can be issued the same code. Lookups are always scoped to
-- one member's own rows first, never a bare hash search across everyone's.

CREATE TABLE IF NOT EXISTS "account_deletion_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "account_deletion_codes" ADD CONSTRAINT "account_deletion_codes_user_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_deletion_codes_user_idx"
	ON "account_deletion_codes" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_deletion_codes_expires_idx"
	ON "account_deletion_codes" USING btree ("expires_at");
