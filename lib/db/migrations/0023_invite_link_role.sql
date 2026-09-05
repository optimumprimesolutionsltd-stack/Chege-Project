-- A join link now says what it grants.
--
-- A chama has one treasurer and forty people who want to know the balance.
-- Making all forty pay to look is what stops the treasurer inviting them, so a
-- view-only link exists and costs its recipients nothing.
--
-- Existing links are member links, which is what every link created before
-- today already was.
--
-- Note it is a plain text column with a default rather than an enum: the role
-- vocabulary lives in GROUP_ROLE, and an enum here would need its own
-- migration every time that grows.

ALTER TABLE "group_invite_links"
	ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'member';
--> statement-breakpoint

-- A group keeps one active link per role: resetting the view link must not
-- silently revoke the link the treasurer sent to their co-signatory.
CREATE INDEX IF NOT EXISTS "group_invite_links_group_role_idx"
	ON "group_invite_links" USING btree ("group_id", "role");
