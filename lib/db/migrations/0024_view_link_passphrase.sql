-- An optional passphrase on a view link.
--
-- A link is a secret that travels badly: it gets forwarded, quoted, screenshot
-- and pasted into the wrong WhatsApp group, and it keeps working afterwards.
-- A passphrase the treasurer says out loud at a meeting does not travel with
-- the link, so possession of the URL alone stops being enough.
--
-- Only the hash is stored, by the same scrypt path as account passwords. A
-- leaked backup is then not a set of working passphrases - which matters more
-- than usual here, because people reuse them.
--
-- Nullable: a link without one behaves exactly as before.

ALTER TABLE "group_invite_links"
	ADD COLUMN IF NOT EXISTS "passphrase_hash" text;
