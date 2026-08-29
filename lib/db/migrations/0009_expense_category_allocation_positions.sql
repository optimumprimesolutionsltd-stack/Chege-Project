-- Corrective migration for environments where 0008 was already applied
-- before ordered, group-consistent allocations were introduced.
ALTER TABLE "expense_category_allocations"
  ADD COLUMN IF NOT EXISTS "position" integer;
--> statement-breakpoint
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "expense_id"
    ORDER BY "id"
  ) - 1 AS position
  FROM "expense_category_allocations"
)
UPDATE "expense_category_allocations" allocation
SET "position" = ranked.position
FROM ranked
WHERE allocation."id" = ranked."id"
  AND allocation."position" IS NULL;
--> statement-breakpoint
ALTER TABLE "expense_category_allocations"
  ALTER COLUMN "position" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "expense_category_allocations"
  DROP CONSTRAINT IF EXISTS "expense_category_allocations_expense_category_unique";
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'expenses'::regclass
      AND contype = 'u'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'expenses'::regclass AND attname = 'id'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'expenses'::regclass AND attname = 'group_id')
      ]::smallint[]
  ) THEN
    ALTER TABLE "expenses" ADD CONSTRAINT "expenses_id_group_unique" UNIQUE ("id", "group_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'expense_category_allocations'::regclass
      AND contype = 'u'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'expense_category_allocations'::regclass AND attname = 'expense_id'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'expense_category_allocations'::regclass AND attname = 'position')
      ]::smallint[]
  ) THEN
    ALTER TABLE "expense_category_allocations"
      ADD CONSTRAINT "expense_category_allocations_expense_position_unique" UNIQUE ("expense_id", "position");
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "expense_category_allocations"
  DROP CONSTRAINT IF EXISTS "expense_category_allocations_expense_id_expenses_id_fk";
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'expense_category_allocations'::regclass
      AND conname = 'expense_category_allocations_expense_group_fk'
  ) THEN
    ALTER TABLE "expense_category_allocations"
      ADD CONSTRAINT "expense_category_allocations_expense_group_fk"
      FOREIGN KEY ("expense_id", "group_id")
      REFERENCES "expenses"("id", "group_id")
      ON DELETE CASCADE;
  END IF;
END $$;