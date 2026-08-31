CREATE TABLE IF NOT EXISTS "onboarding_preferences" (
  "id" integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "user_id" varchar NOT NULL,
  "usage_mode" text NOT NULL,
  "persona" text,
  "budget_duration" text NOT NULL,
  "budget_start_date" date,
  "budget_end_date" date,
  "category_names" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "income_streams" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "completed" boolean NOT NULL DEFAULT false,
  "onboarding_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "onboarding_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "onboarding_preferences_user_id_unique" ON "onboarding_preferences" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_preferences_completed_idx" ON "onboarding_preferences" USING btree ("completed");