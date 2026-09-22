-- A bank charge belongs to the posting it came with.
--
-- The fee is deliberately its own row: folded into the amount, a repayment of
-- 5,000 with a 50 charge would take 5,050 off the loan. But nothing tied the
-- two together, so reopening the posting could not show its fee — and typing
-- an amount there posted a second one, silently, on top of the first.
--
-- Self-referencing, and cascading: a fee without the posting it belongs to is
-- an orphan nobody would ever go looking for, and deleting the posting
-- already removes the money it moved.
--
-- Nothing is backfilled. Charges recorded before this have no parent to point
-- at, and guessing one from a date and a narration would tie the wrong fee to
-- the wrong posting.

ALTER TABLE "joint_account_transactions"
  ADD COLUMN IF NOT EXISTS "charge_for_transaction_id" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'joint_account_transactions_charge_for_transaction_id_fkey'
  ) THEN
    ALTER TABLE "joint_account_transactions"
      ADD CONSTRAINT "joint_account_transactions_charge_for_transaction_id_fkey"
      FOREIGN KEY ("charge_for_transaction_id")
      REFERENCES "joint_account_transactions"("id")
      ON DELETE CASCADE;
  END IF;
END $$;

-- Read whenever a posting is reopened, to find the fee that came with it.
CREATE INDEX IF NOT EXISTS "joint_account_transactions_charge_for_idx"
  ON "joint_account_transactions" ("charge_for_transaction_id")
  WHERE "charge_for_transaction_id" IS NOT NULL;
