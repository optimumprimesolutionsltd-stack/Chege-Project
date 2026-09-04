ALTER TABLE "groups"
  ADD COLUMN IF NOT EXISTS "priority_tiers" jsonb;