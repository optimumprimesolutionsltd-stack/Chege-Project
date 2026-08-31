CREATE TABLE IF NOT EXISTS "onboarding_category_selections" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "onboarding_preference_id" integer NOT NULL REFERENCES "onboarding_preferences"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "source" text NOT NULL DEFAULT 'recommended',
  "priority" integer NOT NULL DEFAULT 1,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_category_selections_parent_name_unique" ON "onboarding_category_selections" USING btree ("onboarding_preference_id", "name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_category_selections_parent_idx" ON "onboarding_category_selections" USING btree ("onboarding_preference_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_budget_allocations" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "onboarding_preference_id" integer NOT NULL REFERENCES "onboarding_preferences"("id") ON DELETE CASCADE,
  "category_name" text NOT NULL,
  "planned_amount" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "onboarding_budget_allocations_planned_amount_nonnegative" CHECK ("planned_amount" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_budget_allocations_parent_name_unique" ON "onboarding_budget_allocations" USING btree ("onboarding_preference_id", "category_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_budget_allocations_parent_idx" ON "onboarding_budget_allocations" USING btree ("onboarding_preference_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "budget_plans" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "created_by_user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "purpose" text,
  "duration_type" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "budget_plans_dates_valid" CHECK ("end_date" IS NULL OR "end_date" >= "start_date")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_plans_group_status_idx" ON "budget_plans" USING btree ("group_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_plans_group_dates_idx" ON "budget_plans" USING btree ("group_id", "start_date", "end_date");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "budget_plan_categories" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "budget_plan_id" integer NOT NULL REFERENCES "budget_plans"("id") ON DELETE CASCADE,
  "budget_category_id" integer REFERENCES "budget_categories"("id") ON DELETE SET NULL,
  "category_name" text NOT NULL,
  "planned_amount" integer NOT NULL DEFAULT 0,
  "priority" integer NOT NULL DEFAULT 1,
  "is_custom" boolean NOT NULL DEFAULT false,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "budget_plan_categories_planned_amount_nonnegative" CHECK ("planned_amount" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "budget_plan_categories_plan_name_unique" ON "budget_plan_categories" USING btree ("budget_plan_id", "category_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "budget_plan_categories_plan_idx" ON "budget_plan_categories" USING btree ("budget_plan_id");
