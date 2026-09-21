-- Lending is not spending.
--
-- The mirror of 0040, and the other half of the same idea. Money lent leaves
-- the account like any withdrawal, but you have not spent it: you expect it
-- back, and it is now owed to you. Counted as spending, every month somebody
-- helps a relative looks like a month they overspent, and the budget they are
-- measured against is wrong by the size of their kindness.
--
-- Unlike borrowing, no figure has to learn to exclude it. Every spending
-- total already filters on expense_category being present — the category
-- breakdown, the ledger, the standalone disbursement total — so a lending
-- posting, which has no category because it is not a cost, falls out of all
-- of them on its own. The money-out-of-the-account figure still counts it,
-- correctly: it really did leave.
--
-- The column is here to say what the row is, for the ledger and for anything
-- later that needs to tell a loan out from a payment with a missing category.
--
-- Nothing is backfilled. A withdrawal already recorded was entered as
-- spending, and nothing here knows which of them were loans.

ALTER TABLE "joint_account_transactions"
  ADD COLUMN IF NOT EXISTS "is_lending" boolean NOT NULL DEFAULT false;
