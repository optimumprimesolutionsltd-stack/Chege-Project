-- A plain notes field on a bank entry, the same as expenses already have.
--
-- The description is the payee or narration, and it is what every list and report
-- reads. Notes is somewhere to put anything else worth keeping against an entry —
-- why an amount looks odd, something to check later — without disturbing what the
-- description says the entry is.
--
-- Nullable, and nothing is backfilled: an entry recorded before this has nothing to
-- put here, and that is exactly what "no note" means.

ALTER TABLE "joint_account_transactions"
  ADD COLUMN IF NOT EXISTS "notes" text;
