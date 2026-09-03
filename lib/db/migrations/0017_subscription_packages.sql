CREATE TABLE IF NOT EXISTS "subscription_plans" (
  "code" text PRIMARY KEY NOT NULL,
  "display_name" text NOT NULL,
  "description" text NOT NULL,
  "audience" text NOT NULL,
  "monthly_price_kes" integer NOT NULL,
  "annual_price_kes" integer NOT NULL,
  "currency" text DEFAULT 'KES' NOT NULL,
  "member_limit" integer,
  "annual_saving_kes" integer,
  "feature_entitlements" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "display_order" integer NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "recommended" boolean DEFAULT false NOT NULL,
  "personal" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_plans_display_order_unique"
  ON "subscription_plans" ("display_order");
CREATE INDEX IF NOT EXISTS "subscription_plans_enabled_order_idx"
  ON "subscription_plans" ("enabled", "display_order");

CREATE TABLE IF NOT EXISTS "group_subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE cascade,
  "owner_admin_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "package_code" text NOT NULL REFERENCES "subscription_plans"("code") ON DELETE restrict,
  "billing_interval" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "expired_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "group_subscriptions_billing_interval_check"
    CHECK ("billing_interval" IN ('monthly', 'annual')),
  CONSTRAINT "group_subscriptions_status_check"
    CHECK ("status" IN ('trial', 'pending', 'active', 'past_due', 'cancelled', 'expired'))
);

CREATE INDEX IF NOT EXISTS "group_subscriptions_group_created_idx"
  ON "group_subscriptions" ("group_id", "created_at");
CREATE INDEX IF NOT EXISTS "group_subscriptions_package_idx"
  ON "group_subscriptions" ("package_code");
CREATE UNIQUE INDEX IF NOT EXISTS "group_subscriptions_one_current_idx"
  ON "group_subscriptions" ("group_id")
  WHERE "status" IN ('trial', 'pending', 'active', 'past_due');

INSERT INTO "subscription_plans" (
  "code", "display_name", "description", "audience",
  "monthly_price_kes", "annual_price_kes", "currency",
  "member_limit", "annual_saving_kes", "feature_entitlements",
  "display_order", "enabled", "recommended", "personal"
) VALUES
  ('PERSONAL_FREE', 'Personal Free', 'Your private starting place for everyday money.', 'Every individual Jamvi user', 0, 0, 'KES', 1, NULL, '["personal_income_tracking","personal_expense_tracking","personal_budgets","personal_categories","basic_reports","shared_group_access"]'::jsonb, 1, true, false, true),
  ('DUO', 'Jamvi Duo', 'A focused Shared budget for two people.', 'Couples and two-person shared budgets', 300, 3000, 'KES', 2, 600, '["personal_income_tracking","personal_expense_tracking","personal_budgets","personal_categories","basic_reports","shared_group_access","shared_income_expense_tracking","separate_personal_shared_budgets","shared_bank_accounts","shared_savings_goals","basic_shared_reports"]'::jsonb, 2, true, false, false),
  ('SMALL_GROUP', 'Jamvi Small Group', 'The practical package for growing groups.', 'Small households, friends, and informal teams', 500, 5000, 'KES', 6, 1000, '["personal_income_tracking","personal_expense_tracking","personal_budgets","personal_categories","basic_reports","shared_group_access","shared_income_expense_tracking","separate_personal_shared_budgets","shared_bank_accounts","shared_savings_goals","basic_shared_reports","multiple_bank_accounts","member_contribution_tracking","shared_categories","shared_budget_limits","basic_activity_history"]'::jsonb, 3, true, true, false),
  ('COMMUNITY', 'Jamvi Community', 'Structure and visibility for active community groups.', 'Small Chamas, welfare groups, and community teams', 1000, 10000, 'KES', 15, 2000, '["contribution_cycles","member_contribution_records","shared_savings_goals","emergency_goals","group_financial_summaries","administrator_member_roles"]'::jsonb, 4, true, false, false),
  ('CLUB', 'Jamvi Club', 'Deeper accountability for organized groups.', 'Clubs, associations, and organized groups', 1500, 15000, 'KES', 30, 3000, '["multiple_administrators","detailed_reports","exportable_records","shared_projects","event_budgets","improved_accountability_history"]'::jsonb, 5, true, false, false),
  ('CHAMA', 'Jamvi Chama', 'Purpose-built controls for larger Chamas.', 'Larger or more structured Chamas', 2000, 20000, 'KES', 50, 4000, '["treasurer_role","administrator_member_roles","member_contribution_tracking","loan_tracking","welfare_fund_tracking","member_balances","enhanced_reports_exports","higher_ask_jamvi_allowance"]'::jsonb, 6, true, false, false),
  ('UNLIMITED', 'Jamvi Unlimited', 'Organization-level visibility without a member ceiling.', 'Large associations, institutions, and organizations', 5000, 50000, 'KES', NULL, 10000, '["multiple_administrators","advanced_permissions","organization_management_tools","full_reporting_exports","detailed_financial_activity_history","priority_support","fair_use_ask_jamvi_allowance"]'::jsonb, 7, true, false, false)
ON CONFLICT ("code") DO UPDATE SET
  "display_name" = EXCLUDED."display_name",
  "description" = EXCLUDED."description",
  "audience" = EXCLUDED."audience",
  "monthly_price_kes" = EXCLUDED."monthly_price_kes",
  "annual_price_kes" = EXCLUDED."annual_price_kes",
  "currency" = EXCLUDED."currency",
  "member_limit" = EXCLUDED."member_limit",
  "annual_saving_kes" = EXCLUDED."annual_saving_kes",
  "feature_entitlements" = EXCLUDED."feature_entitlements",
  "display_order" = EXCLUDED."display_order",
  "recommended" = EXCLUDED."recommended",
  "personal" = EXCLUDED."personal",
  "updated_at" = now();