ALTER TABLE "groups" ADD COLUMN "emoji" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "name_style" text DEFAULT 'plain' NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "slogan" text;