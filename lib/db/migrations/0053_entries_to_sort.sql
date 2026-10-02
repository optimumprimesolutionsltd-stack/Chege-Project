-- Money in saved as "Not sure" during an import, marked so Home can remind
-- the person to sort it out (money out uses the "Not sure yet" category and
-- needs no mark).
--
-- A side table, read only once it exists. The server also creates this itself
-- after it starts (artifacts/api-server/src/lib/entries-to-sort.ts); this
-- records it.

CREATE TABLE IF NOT EXISTS "entries_to_sort" (
  "transaction_id" integer PRIMARY KEY
    REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
  "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "entries_to_sort_group_idx"
  ON "entries_to_sort" ("group_id");
