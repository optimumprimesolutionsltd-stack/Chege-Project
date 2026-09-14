-- A category becomes a tracked debt when debt_balance is set — null means
-- "not a debt", not "zero owed". No separate ledger: the balance is edited
-- directly as it is paid down, the same way a budget amount already is.
-- The rate is basis points (1/100 of a percent) so it is an exact integer
-- rather than a float that drifts on repeated writes.

ALTER TABLE "budget_categories" ADD COLUMN IF NOT EXISTS "debt_balance" integer;
--> statement-breakpoint
ALTER TABLE "budget_categories" ADD COLUMN IF NOT EXISTS "debt_interest_rate_bps" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_debt_balance_non_negative_check"
		CHECK ("debt_balance" IS NULL OR "debt_balance" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_debt_rate_range_check"
		CHECK ("debt_interest_rate_bps" IS NULL OR "debt_interest_rate_bps" BETWEEN 0 AND 10000);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
