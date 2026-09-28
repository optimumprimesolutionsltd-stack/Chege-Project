-- Which payment a "money back" deposit reversed.
--
-- An M-Pesa reversal is a payment that did not go through coming back. It was
-- saved as ordinary money in, so it read as income, while the payment it undid
-- still read as spending: the same shillings counted once on each side for
-- something that never happened.
--
-- Linking the two cancels both. The deposit stops counting as income and the
-- payment stops counting as spending; the balance is untouched, because money
-- out and the same money back already net to nothing.
--
-- The payment stops counting as spending by having its category taken off - the
-- one thing every spending total already filters on - so original_category keeps
-- what it was, and unlinking puts it back exactly.
--
-- A side table rather than columns on joint_account_transactions, for the same
-- reason as debt_entry_links: if it is ever missing, only the code that reads it
-- fails, never an ordinary bank entry. Each deposit reverses at most one payment
-- and each payment is reversed at most once. Deleting either entry removes the
-- link. Nothing is backfilled: a link is only ever made by somebody choosing it.

CREATE TABLE IF NOT EXISTS "reversal_links" (
  "reversal_transaction_id" integer PRIMARY KEY
    REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
  "original_transaction_id" integer NOT NULL UNIQUE
    REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
  "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "original_category" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "reversal_links_group_idx"
  ON "reversal_links" ("group_id");
