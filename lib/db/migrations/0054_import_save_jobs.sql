-- An M-Pesa import saved on the server, so it carries on when the phone closes
-- Jamvi. The phone hands over every entry it worked out; the server saves each
-- through the ordinary routes as that person and keeps what each became here,
-- for the phone to read back. A restart leaves a job running with its lease run
-- out, and the next server carries it on.
--
-- A side table, read only once it exists. The server also creates this itself
-- after it starts (artifacts/api-server/src/lib/import-save-jobs.ts); this
-- records it.

CREATE TABLE IF NOT EXISTS "import_save_jobs" (
  "id" serial PRIMARY KEY,
  "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL,
  "session_id" text,
  "mpesa_account_id" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'running',
  "items" jsonb NOT NULL,
  "results" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "started" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "total" integer NOT NULL,
  "done" integer NOT NULL DEFAULT 0,
  "lease_owner" text,
  "lease_until" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "import_save_jobs_group_user_idx"
  ON "import_save_jobs" ("group_id", "user_id");

CREATE INDEX IF NOT EXISTS "import_save_jobs_running_idx"
  ON "import_save_jobs" ("status") WHERE "status" = 'running';
