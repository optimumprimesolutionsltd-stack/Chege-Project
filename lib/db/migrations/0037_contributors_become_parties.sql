-- Contributors become parties.
--
-- A row here was "everybody who puts money into a group", and the table was
-- already built around a person rather than an account: a name, and a login
-- only if they happen to have one. That is exactly what a debtor or a creditor
-- is, so the concept is widened rather than duplicated. KCB is not a
-- contributor and never will be, but it is a party you owe.
--
-- Nothing existing changes meaning: every current row is a person, and a
-- balance that has never been set is null rather than zero. Null is "not
-- tracked"; zero is a debt that has been cleared, which is worth being able
-- to say.

ALTER TABLE "group_contributors"
  ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'person';

-- Two columns rather than one signed number: a chama member can owe the kitty
-- and be owed by it at the same time, and netting them off hides both.
ALTER TABLE "group_contributors"
  ADD COLUMN IF NOT EXISTS "owed_to_us" integer;

ALTER TABLE "group_contributors"
  ADD COLUMN IF NOT EXISTS "owed_by_us" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_contributors_kind_check'
  ) THEN
    ALTER TABLE "group_contributors"
      ADD CONSTRAINT "group_contributors_kind_check"
      CHECK ("kind" IN ('person', 'institution'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_contributors_owed_to_us_check'
  ) THEN
    ALTER TABLE "group_contributors"
      ADD CONSTRAINT "group_contributors_owed_to_us_check"
      CHECK ("owed_to_us" IS NULL OR "owed_to_us" >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'group_contributors_owed_by_us_check'
  ) THEN
    ALTER TABLE "group_contributors"
      ADD CONSTRAINT "group_contributors_owed_by_us_check"
      CHECK ("owed_by_us" IS NULL OR "owed_by_us" >= 0);
  END IF;
END $$;
