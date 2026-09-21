-- Borrowed money is not income.
--
-- The mirror of 0038. A loan paid out to you reaches the account like any
-- other deposit, but it is not earnings: you will pay it back. Counted as
-- income, the month looks better than it was every time somebody borrows —
-- and the worse the borrowing, the better the month looks.
--
-- It cannot be inferred from what is already stored. Borrowing from a party
-- sets settles_contributor_id and could be told apart by it; borrowing
-- against a tracked debt category sets nothing at all, and would be counted.
-- So it is recorded plainly on the transaction.
--
-- Nothing is backfilled. A deposit already recorded was entered as ordinary
-- money in, and this migration has no way to know which of them were loans —
-- guessing would rewrite history that somebody may have already reconciled.
--
-- No index. Every figure that counts money in filters on NOT is_borrowing,
-- which matches nearly every row, so an index on it would be read past rather
-- than used.

ALTER TABLE "joint_account_transactions"
  ADD COLUMN IF NOT EXISTS "is_borrowing" boolean NOT NULL DEFAULT false;
