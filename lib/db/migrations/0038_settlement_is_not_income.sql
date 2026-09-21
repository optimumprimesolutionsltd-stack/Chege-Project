-- A repayment is not income.
--
-- When somebody who owed you pays you back, the money reaches the account like
-- any other deposit — but you had it once already, when you lent it. Counting
-- it again inflates every income figure by money that was never earned.
--
-- Attribution alone cannot say this. A deposit with no member and no income
-- source is still counted: it shows as money held for the group. So the
-- settlement is recorded on the transaction itself, and the figures that count
-- money in leave those rows out.
--
-- The row stays in the ledger and the activity feed. It really did reach the
-- account, and hiding it would make the app disagree with the bank.
--
-- ON DELETE SET NULL rather than cascade: removing a party must not silently
-- delete the money that moved between you.

ALTER TABLE "joint_account_transactions"
  ADD COLUMN IF NOT EXISTS "settles_contributor_id" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'joint_account_transactions_settles_contributor_id_fkey'
  ) THEN
    ALTER TABLE "joint_account_transactions"
      ADD CONSTRAINT "joint_account_transactions_settles_contributor_id_fkey"
      FOREIGN KEY ("settles_contributor_id")
      REFERENCES "group_contributors"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- Every figure that counts money in filters on this, so it is read on every
-- dashboard load.
CREATE INDEX IF NOT EXISTS "joint_account_transactions_settles_idx"
  ON "joint_account_transactions" ("settles_contributor_id")
  WHERE "settles_contributor_id" IS NOT NULL;
