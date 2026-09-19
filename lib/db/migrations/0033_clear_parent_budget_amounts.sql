-- Clear the budget amount held on a category that has subcategories.
--
-- A parent is budgeted through its subcategories: its figure is theirs added
-- up (see effectiveBudgets in @workspace/category-tree). Since #222 the number
-- stored on the parent is ignored everywhere it was read — the month total,
-- the category breakdown and the monthly-report PDF all compute the parent
-- from its children instead.
--
-- Leaving the old number in the column was a trap. Nothing displayed it, so
-- nobody could correct it, and anything reading budget_categories directly —
-- a future report, an export, a query run by hand — would have found a figure
-- that looks authoritative and is not.
--
-- This changes no number anybody sees. The amount being cleared already
-- counted for nothing; this only makes the storage say so.
--
-- Only rows that have at least one subcategory are touched. A category with
-- none keeps its own figure, which is every category until somebody nests one.

UPDATE "budget_categories" AS parent
SET "budget_amount" = 0
WHERE "budget_amount" <> 0
  AND EXISTS (
    SELECT 1
    FROM "budget_categories" AS child
    WHERE child."parent_id" = parent."id"
  );
