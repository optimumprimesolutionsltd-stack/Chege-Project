-- Adds the plan column that membership-limits.ts reads on every join attempt.
--
-- The schema declared it but no migration created it, so hasMemberCapacity was
-- selecting a column the database did not have. The six-member cap could not
-- work.
--
-- IF NOT EXISTS because jamvi-db may already have the column from a
-- drizzle-kit push. Without it, a second run fails the migration and blocks
-- the deploy.
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "plan" text DEFAULT 'free' NOT NULL;
