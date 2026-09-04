-- Jamvi migration 0014: safe group-sensitive category migration
--
-- The schema change is additive. Existing category rows and all historical
-- expense text are preserved. A category is archived, never deleted. Archived
-- categories remain available to historical reports but are excluded from new
-- category choices by the API.

ALTER TABLE "budget_categories"
  ADD COLUMN IF NOT EXISTS "is_archived" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "budget_categories_group_archived_idx"
  ON "budget_categories" ("group_id", "is_archived");

-- Safe, repeatable migration function. The application admin screen normally
-- performs a reviewed migration for the authenticated active group. This
-- function is provided for a controlled SQL migration/backfill and must be
-- called with one explicit group id, never with all groups implicitly.
CREATE OR REPLACE FUNCTION migrate_budget_categories_for_group(target_group_id integer)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  target_kind text;
BEGIN
  SELECT kind INTO target_kind FROM groups WHERE id = target_group_id;
  IF target_kind IS NULL THEN
    RAISE EXCEPTION 'Group % does not exist', target_group_id;
  END IF;

  -- Archive only known legacy household/personal names when they conflict
  -- with an organisational pack. Custom categories are deliberately retained.
  UPDATE budget_categories
  SET is_archived = TRUE
  WHERE group_id = target_group_id
    AND lower(trim(name)) IN (
      'housing', 'rent', 'mortgage', 'groceries', 'household',
      'household supplies', 'school fees', 'school', 'personal care',
      'utilities', 'childcare'
    )
    AND target_kind IN ('chama', 'club', 'team', 'other');

  -- Add the correct pack without changing an existing category amount,
  -- priority, or archive decision. ON CONFLICT makes this safe to rerun.
  INSERT INTO budget_categories (group_id, name, budget_amount, priority, color, is_archived, is_recurring)
  SELECT target_group_id, pack.name, 0, pack.priority, pack.color, FALSE, TRUE
  FROM (VALUES
    ('Food', 1, '#F97316', 'personal'), ('Housing', 1, '#F59E0B', 'personal'),
    ('Transport', 2, '#8B5CF6', 'personal'), ('Health', 2, '#EF4444', 'personal'),
    ('Utilities', 2, '#EAB308', 'personal'), ('Personal care', 3, '#DB2777', 'personal'),
    ('Food', 1, '#F97316', 'family'), ('Housing', 1, '#F59E0B', 'family'),
    ('Utilities', 1, '#EAB308', 'family'), ('Health', 2, '#EF4444', 'family'),
    ('Education', 2, '#3B82F6', 'family'), ('Transport', 3, '#8B5CF6', 'family'),
    ('Meetings', 1, '#F97316', 'chama'), ('Projects', 1, '#2563EB', 'chama'),
    ('Welfare', 2, '#DB2777', 'chama'), ('Administration', 2, '#6B7280', 'chama'),
    ('Transport', 3, '#8B5CF6', 'chama'), ('Events', 1, '#F97316', 'club'),
    ('Equipment', 1, '#2563EB', 'club'), ('Venue', 2, '#F59E0B', 'club'),
    ('Membership activities', 2, '#059669', 'club'), ('Administration', 3, '#6B7280', 'club'),
    ('Salaries', 1, '#2563EB', 'team'), ('Tools', 1, '#7C3AED', 'team'),
    ('Operations', 2, '#059669', 'team'), ('Travel', 2, '#8B5CF6', 'team'),
    ('Training', 3, '#3B82F6', 'team'), ('Supplies', 1, '#F97316', 'other'),
    ('Operations', 1, '#059669', 'other'), ('Transport', 2, '#8B5CF6', 'other'),
    ('Services', 2, '#2563EB', 'other')
  ) AS pack(name, priority, color, kind)
  WHERE pack.kind = target_kind
  ON CONFLICT (group_id, name) DO NOTHING;
END;
$$;

-- Controlled example (replace 123 with the active group id after preview):
-- BEGIN;
-- SELECT migrate_budget_categories_for_group(123);
-- COMMIT;
--
-- The API admin screen is preferred because it lets the owner/admin review
-- mismatched categories before archiving them. Historical expenses and
-- allocations remain untouched in either path.
