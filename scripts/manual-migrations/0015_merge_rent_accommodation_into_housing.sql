-- Jamvi: merge legacy Rent and Accommodation categories into Housing.
--
-- This migration is intentionally data-preserving:
--   * all affected rows are snapshotted into persistent backup tables first;
--   * expense amounts and historical rows are not deleted;
--   * duplicate plan-category rows are consolidated by summing planned amounts;
--   * a transaction and advisory lock prevent concurrent category writes during the merge.
--
-- Run only after a production database backup and a dry run against a restored copy.
-- The companion rollback script is:
--   scripts/manual-migrations/rollback_0015_merge_rent_accommodation_into_housing.sql

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';
SELECT pg_advisory_xact_lock(hashtextextended('jamvi:merge-rent-accommodation-into-housing', 0));

-- The backup tables are deliberately persistent so the companion rollback can
-- restore the exact pre-migration values for rows touched by this migration.
CREATE TABLE IF NOT EXISTS jamvi_0015_backup_budget_categories AS
SELECT bc.*
FROM budget_categories bc
WHERE false;

CREATE TABLE IF NOT EXISTS jamvi_0015_backup_expenses AS
SELECT e.*
FROM expenses e
WHERE false;

CREATE TABLE IF NOT EXISTS jamvi_0015_backup_expense_category_allocations AS
SELECT a.*
FROM expense_category_allocations a
WHERE false;

CREATE TABLE IF NOT EXISTS jamvi_0015_backup_joint_account_transactions AS
SELECT t.*
FROM joint_account_transactions t
WHERE false;

CREATE TABLE IF NOT EXISTS jamvi_0015_backup_budget_plan_categories AS
SELECT bpc.*
FROM budget_plan_categories bpc
WHERE false;

CREATE TABLE IF NOT EXISTS jamvi_0015_backup_onboarding_preferences AS
SELECT op.*
FROM onboarding_preferences op
WHERE false;

CREATE TABLE IF NOT EXISTS jamvi_0015_backup_onboarding_category_selections AS
SELECT ocs.*
FROM onboarding_category_selections ocs
WHERE false;

CREATE TABLE IF NOT EXISTS jamvi_0015_backup_onboarding_budget_allocations AS
SELECT oba.*
FROM onboarding_budget_allocations oba
WHERE false;

-- Build one survivor per workspace. Prefer an existing Housing row; otherwise
-- the lowest-id legacy row becomes Housing. Only workspace-owned categories are
-- merged. A NULL group_id is not silently combined with another workspace.
CREATE TEMP TABLE jamvi_0015_category_map ON COMMIT DROP AS
WITH candidates AS (
  SELECT
    bc.id,
    bc.group_id,
    lower(btrim(bc.name)) AS normalized_name
  FROM budget_categories bc
  WHERE bc.group_id IS NOT NULL
    AND lower(btrim(bc.name)) IN ('housing', 'rent', 'accommodation')
)
SELECT
  id,
  group_id,
  first_value(id) OVER (
    PARTITION BY group_id
    ORDER BY CASE WHEN normalized_name = 'housing' THEN 0 ELSE 1 END, id
  ) AS survivor_id
FROM candidates;

CREATE TEMP TABLE jamvi_0015_survivors ON COMMIT DROP AS
SELECT DISTINCT group_id, survivor_id
FROM jamvi_0015_category_map;

-- Snapshot category master rows before any rename/delete.
INSERT INTO jamvi_0015_backup_budget_categories
SELECT bc.*
FROM budget_categories bc
JOIN jamvi_0015_category_map cm ON cm.id = bc.id
WHERE NOT EXISTS (
  SELECT 1 FROM jamvi_0015_backup_budget_categories b WHERE b.id = bc.id
);

-- Snapshot all affected expense and ledger rows before changing their category
-- label. The row ids make rollback exact and bounded to this migration.
INSERT INTO jamvi_0015_backup_expenses
SELECT e.*
FROM expenses e
WHERE lower(btrim(e.category)) IN ('rent', 'accommodation')
  AND NOT EXISTS (
    SELECT 1 FROM jamvi_0015_backup_expenses b WHERE b.id = e.id
  );

INSERT INTO jamvi_0015_backup_expense_category_allocations
SELECT a.*
FROM expense_category_allocations a
WHERE lower(btrim(a.category)) IN ('rent', 'accommodation')
  AND NOT EXISTS (
    SELECT 1 FROM jamvi_0015_backup_expense_category_allocations b WHERE b.id = a.id
  );

INSERT INTO jamvi_0015_backup_joint_account_transactions
SELECT t.*
FROM joint_account_transactions t
WHERE lower(btrim(t.expense_category)) IN ('rent', 'accommodation')
  AND NOT EXISTS (
    SELECT 1 FROM jamvi_0015_backup_joint_account_transactions b WHERE b.id = t.id
  );

-- Snapshot plan rows whose displayed name or linked category is one of the
-- aliases. They are merged per plan, not blindly renamed, to avoid violating
-- the plan/name unique index when a plan already has Housing.
INSERT INTO jamvi_0015_backup_budget_plan_categories
SELECT DISTINCT bpc.*
FROM budget_plan_categories bpc
JOIN budget_plans bp ON bp.id = bpc.budget_plan_id
LEFT JOIN jamvi_0015_survivors s ON s.group_id = bp.group_id
LEFT JOIN jamvi_0015_category_map cm ON cm.group_id = bp.group_id AND cm.id = bpc.budget_category_id
WHERE (
    lower(btrim(bpc.category_name)) IN ('housing', 'rent', 'accommodation')
    OR cm.id IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM jamvi_0015_backup_budget_plan_categories b WHERE b.id = bpc.id
  );

-- Snapshot onboarding records as well, because old clients may have persisted
-- aliases before the UI was canonicalized.
INSERT INTO jamvi_0015_backup_onboarding_preferences
SELECT op.*
FROM onboarding_preferences op
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements_text(op.category_names) x(name)
  WHERE lower(btrim(x.name)) IN ('rent', 'accommodation')
)
AND NOT EXISTS (
  SELECT 1 FROM jamvi_0015_backup_onboarding_preferences b WHERE b.id = op.id
);

INSERT INTO jamvi_0015_backup_onboarding_category_selections
SELECT ocs.*
FROM onboarding_category_selections ocs
WHERE lower(btrim(ocs.name)) IN ('housing', 'rent', 'accommodation')
  AND NOT EXISTS (
    SELECT 1 FROM jamvi_0015_backup_onboarding_category_selections b WHERE b.id = ocs.id
  );

INSERT INTO jamvi_0015_backup_onboarding_budget_allocations
SELECT oba.*
FROM onboarding_budget_allocations oba
WHERE lower(btrim(oba.category_name)) IN ('housing', 'rent', 'accommodation')
  AND NOT EXISTS (
    SELECT 1 FROM jamvi_0015_backup_onboarding_budget_allocations b WHERE b.id = oba.id
  );

-- Merge duplicate plan-category rows before changing their names. The keeper
-- is the existing Housing row when present, otherwise the lowest id. Planned
-- amounts are additive; priority and position preserve the earliest row; a
-- custom flag remains true if any merged row was custom.
CREATE TEMP TABLE jamvi_0015_plan_merge ON COMMIT DROP AS
WITH affected AS (
  SELECT
    bpc.id,
    bpc.budget_plan_id,
    s.survivor_id,
    bpc.planned_amount,
    bpc.priority,
    bpc.is_custom,
    bpc.position,
    row_number() OVER (
      PARTITION BY bpc.budget_plan_id
      ORDER BY CASE WHEN lower(btrim(bpc.category_name)) = 'housing' THEN 0 ELSE 1 END, bpc.id
    ) AS row_number_in_plan,
    sum(bpc.planned_amount) OVER (PARTITION BY bpc.budget_plan_id) AS merged_planned_amount,
    min(bpc.priority) OVER (PARTITION BY bpc.budget_plan_id) AS merged_priority,
    bool_or(bpc.is_custom) OVER (PARTITION BY bpc.budget_plan_id) AS merged_is_custom,
    min(bpc.position) OVER (PARTITION BY bpc.budget_plan_id) AS merged_position
  FROM budget_plan_categories bpc
  JOIN budget_plans bp ON bp.id = bpc.budget_plan_id
  LEFT JOIN jamvi_0015_survivors s ON s.group_id = bp.group_id
  LEFT JOIN jamvi_0015_category_map cm ON cm.group_id = bp.group_id AND cm.id = bpc.budget_category_id
    WHERE (
      lower(btrim(bpc.category_name)) IN ('housing', 'rent', 'accommodation')
      OR cm.id IS NOT NULL
    )
)
SELECT * FROM affected;

UPDATE budget_plan_categories bpc
SET
  category_name = 'Housing',
  budget_category_id = pm.survivor_id,
  planned_amount = pm.merged_planned_amount,
  priority = pm.merged_priority,
  is_custom = pm.merged_is_custom,
  position = pm.merged_position,
  updated_at = now()
FROM jamvi_0015_plan_merge pm
WHERE pm.row_number_in_plan = 1
  AND pm.id = bpc.id;

DELETE FROM budget_plan_categories bpc
USING jamvi_0015_plan_merge pm
WHERE pm.row_number_in_plan > 1
  AND pm.id = bpc.id;

-- Canonicalize all historical category labels. This preserves the expense,
-- allocation, and ledger row ids and only changes the display/category key.
UPDATE expenses
SET category = 'Housing'
WHERE lower(btrim(category)) IN ('rent', 'accommodation');

UPDATE expense_category_allocations
SET category = 'Housing'
WHERE lower(btrim(category)) IN ('rent', 'accommodation');

UPDATE joint_account_transactions
SET expense_category = 'Housing'
WHERE lower(btrim(expense_category)) IN ('rent', 'accommodation');

-- Rename the selected category survivor and remove only the duplicate alias
-- master rows. All known budget-plan foreign keys were repointed above; any
-- remaining FK reference is protected by the schema's ON DELETE SET NULL.
UPDATE budget_categories bc
SET name = 'Housing'
FROM jamvi_0015_survivors s
WHERE bc.id = s.survivor_id
  AND bc.name IS DISTINCT FROM 'Housing';

DELETE FROM budget_categories bc
USING jamvi_0015_category_map cm
WHERE bc.id = cm.id
  AND cm.id <> cm.survivor_id;

-- Canonicalize and deduplicate onboarding JSON arrays while retaining the
-- first-seen order. This is safe for old mobile/web drafts.
UPDATE onboarding_preferences op
SET category_names = COALESCE(
  (
    SELECT jsonb_agg(to_jsonb(canonical_name) ORDER BY first_position)
    FROM (
      SELECT DISTINCT ON (lower(canonical_name))
        canonical_name,
        first_position
      FROM (
        SELECT
          CASE
            WHEN lower(btrim(raw_name)) IN ('rent', 'accommodation') THEN 'Housing'
            ELSE btrim(raw_name)
          END AS canonical_name,
          first_position
        FROM jsonb_array_elements_text(op.category_names) WITH ORDINALITY AS x(raw_name, first_position)
        WHERE btrim(raw_name) <> ''
      ) named
      ORDER BY lower(canonical_name), first_position
    ) canonical
  ),
  '[]'::jsonb
)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements_text(op.category_names) x(name)
  WHERE lower(btrim(x.name)) IN ('rent', 'accommodation')
);

-- Merge onboarding selection duplicates, preferring an existing Housing row.
CREATE TEMP TABLE jamvi_0015_selection_merge ON COMMIT DROP AS
SELECT
  ocs.id,
  row_number() OVER (
    PARTITION BY ocs.onboarding_preference_id
    ORDER BY CASE WHEN lower(btrim(ocs.name)) = 'housing' THEN 0 ELSE 1 END, ocs.id
  ) AS row_number_in_parent
FROM onboarding_category_selections ocs
WHERE lower(btrim(ocs.name)) IN ('housing', 'rent', 'accommodation');

UPDATE onboarding_category_selections ocs
SET name = 'Housing'
FROM jamvi_0015_selection_merge sm
WHERE sm.row_number_in_parent = 1 AND sm.id = ocs.id;

DELETE FROM onboarding_category_selections ocs
USING jamvi_0015_selection_merge sm
WHERE sm.row_number_in_parent > 1 AND sm.id = ocs.id;

-- Merge onboarding planned allocations, summing any duplicate amounts.
CREATE TEMP TABLE jamvi_0015_allocation_merge ON COMMIT DROP AS
WITH affected AS (
  SELECT
    oba.id,
    row_number() OVER (
      PARTITION BY oba.onboarding_preference_id
      ORDER BY CASE WHEN lower(btrim(oba.category_name)) = 'housing' THEN 0 ELSE 1 END, oba.id
    ) AS row_number_in_parent,
    sum(oba.planned_amount) OVER (PARTITION BY oba.onboarding_preference_id) AS merged_planned_amount
  FROM onboarding_budget_allocations oba
  WHERE lower(btrim(oba.category_name)) IN ('housing', 'rent', 'accommodation')
)
SELECT * FROM affected;

UPDATE onboarding_budget_allocations oba
SET category_name = 'Housing', planned_amount = am.merged_planned_amount, updated_at = now()
FROM jamvi_0015_allocation_merge am
WHERE am.row_number_in_parent = 1 AND am.id = oba.id;

DELETE FROM onboarding_budget_allocations oba
USING jamvi_0015_allocation_merge am
WHERE am.row_number_in_parent > 1 AND am.id = oba.id;

COMMIT;
