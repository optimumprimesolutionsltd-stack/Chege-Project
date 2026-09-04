ALTER TABLE "bank_accounts"
  ADD COLUMN IF NOT EXISTS "opening_balance_date" date;
--> statement-breakpoint
ALTER TABLE "bank_accounts"
  ALTER COLUMN "opening_balance" TYPE numeric(14, 2)
  USING "opening_balance"::numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "joint_account_transactions"
  ALTER COLUMN "amount" TYPE numeric(14, 2)
  USING "amount"::numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "joint_account_deposit_splits"
  ALTER COLUMN "amount" TYPE numeric(14, 2)
  USING "amount"::numeric(14, 2);