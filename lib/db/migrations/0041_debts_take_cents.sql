-- Debts and party balances in shillings and cents.
--
-- Bank postings have taken two decimals since they existed; what is owed
-- never did. So paying KES 1,250.75 off a loan moved the balance by 1,251,
-- and the debt drifted by a few shillings every time it was touched — in the
-- one figure somebody is watching go down.
--
-- numeric(14,2) is what opening_balance and the transaction amounts already
-- use, read back as a number rather than a string, so nothing downstream has
-- to learn a new shape.
--
-- Widening integer to numeric is lossless: every existing whole number stays
-- exactly what it was, with .00 after it. The >= 0 checks already on these
-- columns still hold and are left alone.

ALTER TABLE "budget_categories"
  ALTER COLUMN "debt_balance" TYPE numeric(14, 2);

ALTER TABLE "group_contributors"
  ALTER COLUMN "owed_to_us" TYPE numeric(14, 2);

ALTER TABLE "group_contributors"
  ALTER COLUMN "owed_by_us" TYPE numeric(14, 2);
