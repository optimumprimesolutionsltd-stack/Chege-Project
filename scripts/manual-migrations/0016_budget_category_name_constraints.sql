-- Jamvi: enforce normalized uniqueness and valid names for budget categories.
--
-- Prerequisite: run 0015_merge_rent_accommodation_into_housing.sql first and
-- verify there are no remaining duplicates under lower(btrim(name)).
-- Run this script only after a production backup and a staging dry run.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';
SELECT pg_advisory_xact_lock(hashtextextended('jamvi:budget-category-name-constraints', 0));

-- Fail before changing the schema if legacy data still conflicts with the
-- normalized uniqueness invariant. The merge migration should have removed
-- Rent/Accommodation conflicts, but this catches any other historical variant.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM budget_categories
    GROUP BY group_id, lower(btrim(name))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add normalized category uniqueness: duplicate group/name values remain';
  END IF;
END $$;

-- The old exact-match unique constraint does not protect case or whitespace
-- variants, so replace it with the expression-based normalized unique index.
ALTER TABLE budget_categories
  DROP CONSTRAINT IF EXISTS budget_categories_group_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS budget_categories_group_name_normalized_unique
  ON budget_categories (group_id, lower(btrim(name)));

ALTER TABLE budget_categories
  ADD CONSTRAINT budget_categories_name_valid_check
  CHECK (btrim(name) <> '' AND char_length(name) <= 80);

COMMIT;
