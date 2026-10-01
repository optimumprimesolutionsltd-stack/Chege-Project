-- Budgets that change over time.
--
-- A category's budget_amount is its budget now. When it changes, the amount it
-- had is recorded here against the month the change took effect ("until
-- October it was 80,000"), so earlier months keep the budget they had; a
-- month uses the first such change after it, or budget_amount when none comes
-- later. only_this_month rows are a budget for that one month alone.
--
-- A side table, read defensively: if it is ever missing, every month uses
-- budget_amount, as before. The server also creates this itself after it
-- starts (artifacts/api-server/src/lib/budget-months.ts); this records it.

CREATE TABLE IF NOT EXISTS "budget_category_months" (
  "id" serial PRIMARY KEY,
  "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "category_id" integer NOT NULL REFERENCES "budget_categories"("id") ON DELETE CASCADE,
  "year" integer NOT NULL,
  "month" integer NOT NULL,
  "amount" integer NOT NULL,
  "only_this_month" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "budget_category_months_category_month_idx"
  ON "budget_category_months" ("category_id", "year", "month", "only_this_month");

CREATE INDEX IF NOT EXISTS "budget_category_months_group_idx"
  ON "budget_category_months" ("group_id");
