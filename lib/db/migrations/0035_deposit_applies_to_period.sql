-- The month a deposit was *for*, separate from the day it arrived.
--
-- A hand-recorded contribution has always carried month/year of its own,
-- separate from created_at, so entering April's dues in September counts
-- toward April. A bank deposit had only its real date, so the same payment
-- made through the bank counted as September: April stayed in arrears and
-- September showed a surplus, and the two could never be reconciled.
--
-- The real date is untouched and stays authoritative — it has to match the
-- bank statement line for line, and a date somebody can move to tidy a report
-- is a date that reconciles nothing. This is an addition beside it.
--
-- Null means "the month it arrived in", which is every existing row and every
-- new deposit unless somebody says otherwise. No backfill: stamping the
-- arrival month onto old rows would turn an absent answer into an asserted
-- one, and they read identically either way.
--
-- Both directions are allowed. Paying April's dues in September is a late
-- payment; paying June's in April is a prepayment, and it is the same
-- mechanism pointed forward.

ALTER TABLE "joint_account_transactions"
  ADD COLUMN IF NOT EXISTS "applies_to_month" integer,
  ADD COLUMN IF NOT EXISTS "applies_to_year" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'joint_account_tx_applies_to_check'
  ) THEN
    ALTER TABLE "joint_account_transactions"
      ADD CONSTRAINT "joint_account_tx_applies_to_check"
      CHECK (
        -- Both or neither: a month without a year names no period at all.
        ("applies_to_month" IS NULL) = ("applies_to_year" IS NULL)
        AND ("applies_to_month" IS NULL OR "applies_to_month" BETWEEN 1 AND 12)
        AND ("applies_to_year" IS NULL OR "applies_to_year" BETWEEN 2000 AND 2200)
      );
  END IF;
END $$;

-- Read by the contribution grid a month at a time.
CREATE INDEX IF NOT EXISTS "joint_account_tx_applies_to_idx"
  ON "joint_account_transactions" ("group_id", "applies_to_year", "applies_to_month");
