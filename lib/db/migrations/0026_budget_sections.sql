-- Which parts of Jamvi a budget actually uses.
--
-- A chama that only collects money should see one tab, not nine. Showing a
-- group nine screens it has no mandate for is how an app starts feeling like
-- work, and it is the same complaint that made grouping and sub-categories
-- right: show people what they came for.
--
-- Null means "everything", which is what every existing budget gets, so no
-- group changes behaviour on migration. A new budget seeds this from its kind.
--
-- Hiding never deletes. A section switched off keeps every record it had and
-- reappears intact when switched back on - a chama that turns expenses off in
-- March and needs it again in June must not discover March is gone. So this
-- filters navigation only, and touches no data.

ALTER TABLE "groups"
	ADD COLUMN IF NOT EXISTS "enabled_sections" jsonb;
