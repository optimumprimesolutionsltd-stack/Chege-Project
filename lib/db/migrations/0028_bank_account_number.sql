-- lib/db/src/schema/budget.ts has defined bankAccountsTable.accountNumber
-- since August 29 (commit fc6371b), but no migration ever added the column —
-- found by running the account-deletion integration test against a fresh
-- scratch database built purely from this repo's migrations, where every
-- insert into bank_accounts fails with "column account_number does not
-- exist" because Drizzle's generated INSERT names every schema column
-- regardless of which ones a caller sets. If production's own database
-- already carries this column (added out of band, e.g. by a past
-- `drizzle-kit push`), this is a no-op there; if it does not, this is the
-- fix.

ALTER TABLE "bank_accounts"
	ADD COLUMN IF NOT EXISTS "account_number" text;
