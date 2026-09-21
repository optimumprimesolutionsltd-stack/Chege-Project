-- Recognise an M-Pesa message already recorded.
--
-- A parsed message can be pasted twice: the same SMS forwarded, a list
-- re-imported, a tap repeated on a slow connection. Without something to
-- recognise it by, each paste is a fresh posting and the balance drifts by
-- whatever was counted again — silently, because both postings look correct.
--
-- The receipt code is unique per transaction and printed on every message, so
-- it is the thing to recognise. Unique per group rather than globally: two
-- budgets can legitimately hold the same message when one person records a
-- payment in their own budget and again in a group's.
--
-- Null for everything entered by hand, which is most of it, and a partial
-- index so those rows are not forced to be distinct from each other.

ALTER TABLE "joint_account_transactions"
  ADD COLUMN IF NOT EXISTS "mpesa_receipt" text;

CREATE UNIQUE INDEX IF NOT EXISTS "joint_account_transactions_group_receipt_unique"
  ON "joint_account_transactions" ("group_id", "mpesa_receipt")
  WHERE "mpesa_receipt" IS NOT NULL;
