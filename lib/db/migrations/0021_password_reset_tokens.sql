-- One-time links for resetting a forgotten password.
--
-- Only the hash of the token is stored. A leaked backup is then not a set of
-- working reset links, which it would be if the raw value were kept.

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_idx"
	ON "password_reset_tokens" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expires_idx"
	ON "password_reset_tokens" USING btree ("expires_at");
