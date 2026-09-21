-- Bank charges become ordinary spending.
--
-- A charge was a disbursement carrying a flag, kept out of household spending
-- because it belongs to no category and no budget was set for it. That
-- distinction is being retired: fees are now recorded against a category like
-- any other cost, which is what a business doing its own books wants.
--
-- The flag itself is left standing. Every row keeps it, and nothing reads it
-- any more. Clearing it would destroy the only record of which postings were
-- fees, and this is reversible only while that record survives. Dropping the
-- column would be worse still.
--
-- Balances do not move: a charge already reduced the account. What changes is
-- that these amounts now count as spending, against the category named here.

-- A group can only have its charges filed under a category it owns, so make
-- sure one exists first. Priority 3 rather than 1: a fee is not a choice, so
-- ranking it "must-pay" says nothing useful. Budget zero means "track this,
-- do not judge it" — right for something nobody controls.
INSERT INTO "budget_categories" ("group_id", "name", "budget_amount", "priority", "color", "is_recurring")
SELECT DISTINCT tx."group_id", 'Bank charges', 0, 3, '#6B7280', true
FROM "joint_account_transactions" tx
WHERE tx."bank_charge" = true
  AND tx."group_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "budget_categories" c
    WHERE c."group_id" = tx."group_id"
      AND lower(btrim(c."name")) = 'bank charges'
  );

-- Only where the posting has no category of its own. A charge recorded with
-- one already is left alone: somebody chose that, and this should not
-- overwrite a decision it did not make.
UPDATE "joint_account_transactions" tx
SET "expense_category" = (
  SELECT c."name" FROM "budget_categories" c
  WHERE c."group_id" = tx."group_id"
    AND lower(btrim(c."name")) = 'bank charges'
  LIMIT 1
)
WHERE tx."bank_charge" = true
  AND tx."group_id" IS NOT NULL
  AND COALESCE(btrim(tx."expense_category"), '') = '';
