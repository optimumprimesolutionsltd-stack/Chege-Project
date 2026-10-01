-- Expected income that changes over time - the same model as
-- budget_category_months (0050). An income source's expected_monthly_amount
-- is what it is expected to bring in now; when that changes, the amount it
-- had is recorded here against the month the change took effect, so earlier
-- months keep what was expected then. only_this_month rows are one month's
-- expectation alone.
--
-- A side table, read defensively. The server also creates this itself after
-- it starts (artifacts/api-server/src/lib/income-months.ts); this records it.

CREATE TABLE IF NOT EXISTS "income_source_months" (
  "id" serial PRIMARY KEY,
  "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "income_source_id" integer NOT NULL REFERENCES "income_sources"("id") ON DELETE CASCADE,
  "year" integer NOT NULL,
  "month" integer NOT NULL,
  "amount" integer NOT NULL,
  "only_this_month" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "income_source_months_source_month_idx"
  ON "income_source_months" ("income_source_id", "year", "month", "only_this_month");

CREATE INDEX IF NOT EXISTS "income_source_months_group_idx"
  ON "income_source_months" ("group_id");
