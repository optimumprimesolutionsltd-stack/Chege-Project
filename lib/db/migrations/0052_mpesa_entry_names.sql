-- The name M-Pesa gave an imported entry, kept when the person renamed the
-- payee during the import ("NAIVAS LTD" saved as "Supermarket"), so Search
-- still finds it by the name on the statement.
--
-- A side table, read only once it exists: a new column on
-- joint_account_transactions would break every bank query between the deploy
-- and the column being added. The server also creates this itself after it
-- starts (artifacts/api-server/src/lib/mpesa-names.ts); this records it.

CREATE TABLE IF NOT EXISTS "mpesa_entry_names" (
  "transaction_id" integer PRIMARY KEY
    REFERENCES "joint_account_transactions"("id") ON DELETE CASCADE,
  "group_id" integer NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "mpesa_entry_names_group_idx"
  ON "mpesa_entry_names" ("group_id");
