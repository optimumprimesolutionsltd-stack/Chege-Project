-- Roll back 0015_merge_rent_accommodation_into_housing.sql.
--
-- Run only after stopping writes to the affected workspaces and after checking
-- that no post-migration changes were made to the backed-up rows. This restores
-- the exact pre-migration values captured by the forward migration.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';
SELECT pg_advisory_xact_lock(hashtextextended('jamvi:merge-rent-accommodation-into-housing', 0));

-- Restore labels changed in place.
UPDATE expenses e
SET category = b.category
FROM jamvi_0015_backup_expenses b
WHERE e.id = b.id;

UPDATE expense_category_allocations a
SET category = b.category
FROM jamvi_0015_backup_expense_category_allocations b
WHERE a.id = b.id;

UPDATE joint_account_transactions t
SET expense_category = b.expense_category
FROM jamvi_0015_backup_joint_account_transactions b
WHERE t.id = b.id;

-- Restore onboarding JSON exactly as it was.
UPDATE onboarding_preferences op
SET category_names = b.category_names,
    updated_at = b.updated_at
FROM jamvi_0015_backup_onboarding_preferences b
WHERE op.id = b.id;

-- Restore plan-category survivors first, then reinsert rows deleted by the
-- forward merge. The original primary keys are retained for exact recovery.
UPDATE budget_plan_categories bpc
SET budget_category_id = b.budget_category_id,
    category_name = b.category_name,
    planned_amount = b.planned_amount,
    priority = b.priority,
    is_custom = b.is_custom,
    position = b.position,
    created_at = b.created_at,
    updated_at = b.updated_at
FROM jamvi_0015_backup_budget_plan_categories b
WHERE bpc.id = b.id;

INSERT INTO budget_plan_categories
SELECT b.*
FROM jamvi_0015_backup_budget_plan_categories b
WHERE NOT EXISTS (
  SELECT 1 FROM budget_plan_categories current_row WHERE current_row.id = b.id
);

-- Restore onboarding category selections and allocations similarly.
UPDATE onboarding_category_selections current_row
SET onboarding_preference_id = b.onboarding_preference_id,
    name = b.name,
    source = b.source,
    priority = b.priority,
    position = b.position,
    created_at = b.created_at
FROM jamvi_0015_backup_onboarding_category_selections b
WHERE current_row.id = b.id;

INSERT INTO onboarding_category_selections
SELECT b.*
FROM jamvi_0015_backup_onboarding_category_selections b
WHERE NOT EXISTS (
  SELECT 1 FROM onboarding_category_selections current_row WHERE current_row.id = b.id
);

UPDATE onboarding_budget_allocations current_row
SET onboarding_preference_id = b.onboarding_preference_id,
    category_name = b.category_name,
    planned_amount = b.planned_amount,
    created_at = b.created_at,
    updated_at = b.updated_at
FROM jamvi_0015_backup_onboarding_budget_allocations b
WHERE current_row.id = b.id;

INSERT INTO onboarding_budget_allocations
SELECT b.*
FROM jamvi_0015_backup_onboarding_budget_allocations b
WHERE NOT EXISTS (
  SELECT 1 FROM onboarding_budget_allocations current_row WHERE current_row.id = b.id
);

-- Restore the category master rows. Deleted Rent/Accommodation rows are
-- reinserted with their original ids; the serial sequence is advanced below.
UPDATE budget_categories current_row
SET group_id = b.group_id,
    name = b.name,
    budget_amount = b.budget_amount,
    priority = b.priority,
    color = b.color,
    is_archived = b.is_archived,
    is_recurring = b.is_recurring,
    active_month = b.active_month,
    active_year = b.active_year
FROM jamvi_0015_backup_budget_categories b
WHERE current_row.id = b.id;

INSERT INTO budget_categories
SELECT b.*
FROM jamvi_0015_backup_budget_categories b
WHERE NOT EXISTS (
  SELECT 1 FROM budget_categories current_row WHERE current_row.id = b.id
);

SELECT setval(
  pg_get_serial_sequence('budget_categories', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM budget_categories), 1),
  true
);

COMMIT;
