-- Remove a duplicate category that is an alias of one already in the group,
-- but only where nothing has ever been recorded against it.
--
-- "Rent" and "Accommodation" are aliases of Housing. Onboarding already folds
-- them in (ONBOARDING_CATEGORY_ALIASES), so a group that went through setup
-- gets Housing; one created by hand afterwards keeps the alias, and the group
-- ends up holding both. Spending is then split across two categories that mean
-- the same thing, which is what the staging integrity check reports.
--
-- Renaming the alias to Housing cannot work: budget_categories has a unique
-- index on (group_id, lower(btrim(name))), and the whole problem is that
-- Housing is already there. That is what the earlier fixer script attempted,
-- and it would have failed on this data.
--
-- So: delete the alias, and only when it is genuinely unused. Every guard
-- below has to hold — no subcategory nested under it (the foreign key is
-- ON DELETE RESTRICT and would refuse anyway), and no expense, allocation or
-- tagged bank payment naming it. A category anybody has actually used is left
-- alone; merging that one is a judgement about money and does not belong in a
-- migration that runs unattended.
--
-- Idempotent: a second run matches nothing.

DELETE FROM "budget_categories" AS alias
WHERE lower(btrim(alias."name")) IN ('rent', 'accommodation')
  AND EXISTS (
    -- Only where the canonical name is already in the same group. Without
    -- this, a group whose only housing category is called "Rent" would lose
    -- it and have nothing.
    SELECT 1 FROM "budget_categories" AS canonical
    WHERE canonical."group_id" = alias."group_id"
      AND lower(btrim(canonical."name")) = 'housing'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "budget_categories" AS child WHERE child."parent_id" = alias."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "expenses" AS e
    WHERE e."group_id" = alias."group_id"
      AND lower(btrim(e."category")) = lower(btrim(alias."name"))
  )
  AND NOT EXISTS (
    SELECT 1 FROM "expense_category_allocations" AS a
    WHERE a."group_id" = alias."group_id"
      AND lower(btrim(a."category")) = lower(btrim(alias."name"))
  )
  AND NOT EXISTS (
    SELECT 1 FROM "joint_account_transactions" AS t
    WHERE t."group_id" = alias."group_id"
      AND lower(btrim(t."expense_category")) = lower(btrim(alias."name"))
  );
