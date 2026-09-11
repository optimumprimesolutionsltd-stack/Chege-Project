-- Account deletion.
--
-- deletion_requested_at starts the grace period; signing back in before it
-- runs out clears it, cancelling the request. deleted_at is set once the
-- period actually runs out and the account has been erased. Both null is the
-- steady state every existing account is already in, so this is purely
-- additive.

ALTER TABLE "users"
	ADD COLUMN IF NOT EXISTS "deletion_requested_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "users"
	ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
