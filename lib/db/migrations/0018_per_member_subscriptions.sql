-- Jamvi moves from seven group packages to one subscription bought per member.
--
-- Groups no longer have a plan or a bill. A chama of fifty is fifty current
-- members, so there is no member limit left to price against.
--
-- Safe to run against a database that has had 0017 applied: 0017 created the
-- catalogue tables earlier the same day and no payment integration has ever
-- written to them, so there is no billing history to preserve.

CREATE TABLE IF NOT EXISTS "user_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"package_code" text NOT NULL,
	"billing_interval" text NOT NULL,
	"status" text DEFAULT 'trial' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"grace_ends_at" timestamp with time zone,
	"promo_code" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promo_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"monthly_price_kes" integer NOT NULL,
	"annual_price_kes" integer NOT NULL,
	"max_redemptions" integer,
	"redemptions" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_package_code_subscription_plans_code_fk"
		FOREIGN KEY ("package_code") REFERENCES "public"."subscription_plans"("code") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_subscriptions_user_created_idx"
	ON "user_subscriptions" USING btree ("user_id","created_at");
--> statement-breakpoint
-- One live subscription per member. Cancelled and expired rows stay as history.
CREATE UNIQUE INDEX IF NOT EXISTS "user_subscriptions_one_current_idx"
	ON "user_subscriptions" USING btree ("user_id")
	WHERE "status" IN ('trial', 'pending', 'active', 'past_due');
--> statement-breakpoint
-- The seven tiers become one plan. Member limits are gone: group size is no
-- longer a billing question, so nothing reads member_limit any more.
DELETE FROM "subscription_plans"
WHERE "code" IN ('PERSONAL_FREE', 'DUO', 'SMALL_GROUP', 'COMMUNITY', 'CLUB', 'CHAMA', 'UNLIMITED');
--> statement-breakpoint
INSERT INTO "subscription_plans" (
	"code", "display_name", "description", "audience",
	"monthly_price_kes", "annual_price_kes", "currency",
	"member_limit", "annual_saving_kes", "feature_entitlements",
	"display_order", "enabled", "recommended", "personal"
) VALUES (
	'JAMVI',
	'Jamvi',
	'Your own budget, and every group you are part of.',
	'Everyone using Jamvi',
	100, 1000, 'KES',
	NULL, 200,
	'["personal_income_tracking","personal_expense_tracking","personal_budgets","personal_categories","personal_savings_goals","full_month_history","reports_and_trends","exportable_records","shared_group_access","shared_income_expense_tracking","shared_bank_accounts","shared_savings_goals","member_contribution_tracking","administrator_member_roles","ask_jamvi"]'::jsonb,
	1, true, false, false
)
ON CONFLICT ("code") DO UPDATE SET
	"display_name" = EXCLUDED."display_name",
	"description" = EXCLUDED."description",
	"audience" = EXCLUDED."audience",
	"monthly_price_kes" = EXCLUDED."monthly_price_kes",
	"annual_price_kes" = EXCLUDED."annual_price_kes",
	"member_limit" = EXCLUDED."member_limit",
	"annual_saving_kes" = EXCLUDED."annual_saving_kes",
	"feature_entitlements" = EXCLUDED."feature_entitlements",
	"display_order" = EXCLUDED."display_order",
	"enabled" = EXCLUDED."enabled";
--> statement-breakpoint
-- The per-group model, dropped only if nothing was ever written to it. Guarded
-- rather than assumed: if a row exists, the table stays and this is a question
-- for a person, not a migration.
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM "group_subscriptions") THEN
		DROP TABLE "group_subscriptions";
	END IF;
END $$;
