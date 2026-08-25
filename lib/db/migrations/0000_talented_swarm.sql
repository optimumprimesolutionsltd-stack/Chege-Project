CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"preferred_name" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "budget_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer,
	"name" text NOT NULL,
	"budget_amount" integer NOT NULL,
	"priority" integer DEFAULT 1 NOT NULL,
	"color" text DEFAULT '#6B7280' NOT NULL,
	"is_recurring" boolean DEFAULT true NOT NULL,
	"active_month" integer,
	"active_year" integer,
	CONSTRAINT "budget_categories_group_name_unique" UNIQUE("group_id","name")
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer,
	"user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digest_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"email_id" text,
	"recipients" text[],
	"sent_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "digest_sends_group_month_year_unique" UNIQUE("group_id","month","year")
);
--> statement-breakpoint
CREATE TABLE "expense_income_splits" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer,
	"expense_id" integer NOT NULL,
	"user_id" text,
	"label" text NOT NULL,
	"amount" integer NOT NULL,
	"income_source_id" integer,
	"from_bank" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer,
	"amount" integer NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"notes" text,
	"paid_by_id" text,
	"income_source_id" integer,
	"paid_from_bank" boolean DEFAULT false NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "income_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"expected_monthly_amount" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "joint_account_deposit_splits" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer,
	"transaction_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"income_source_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "joint_account_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"description" text NOT NULL,
	"made_by_id" text,
	"income_source_id" integer,
	"expense_category" text,
	"savings_goal_id" integer,
	"transfer_direction" text,
	"expense_id" integer,
	"date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"user_id" text PRIMARY KEY NOT NULL,
	"group_id" integer,
	"added_by_user_id" text,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"monthly_target" integer
);
--> statement-breakpoint
CREATE TABLE "savings_goal_contributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer,
	"goal_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"note" text,
	"is_balance_correction" boolean DEFAULT false NOT NULL,
	"created_by_user_id" text,
	"bank_transaction_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "savings_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer,
	"name" text NOT NULL,
	"target_amount" integer NOT NULL,
	"current_amount" integer DEFAULT 0 NOT NULL,
	"deadline" date,
	"created_by_user_id" text NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "group_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "group_invite_contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_invite_contacts_group_email_unique" UNIQUE("group_id","email")
);
--> statement-breakpoint
CREATE TABLE "group_invite_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "group_invite_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "group_memberships" (
	"group_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"added_by_user_id" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"monthly_target" integer,
	CONSTRAINT "group_memberships_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"legacy_key" text,
	"private_owner_user_id" text,
	"bank_opening_balance" integer DEFAULT 0 NOT NULL,
	"kind" text DEFAULT 'family' NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_legacy_key_unique" UNIQUE("legacy_key"),
	CONSTRAINT "groups_private_owner_user_id_unique" UNIQUE("private_owner_user_id")
);
--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_sends" ADD CONSTRAINT "digest_sends_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_income_splits" ADD CONSTRAINT "expense_income_splits_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_income_splits" ADD CONSTRAINT "expense_income_splits_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joint_account_deposit_splits" ADD CONSTRAINT "joint_account_deposit_splits_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joint_account_deposit_splits" ADD CONSTRAINT "joint_account_deposit_splits_transaction_id_joint_account_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."joint_account_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joint_account_transactions" ADD CONSTRAINT "joint_account_transactions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "joint_account_transactions" ADD CONSTRAINT "joint_account_transactions_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goal_contributions" ADD CONSTRAINT "savings_goal_contributions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goal_contributions" ADD CONSTRAINT "savings_goal_contributions_goal_id_savings_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."savings_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invite_contacts" ADD CONSTRAINT "group_invite_contacts_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invite_contacts" ADD CONSTRAINT "group_invite_contacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invite_links" ADD CONSTRAINT "group_invite_links_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invite_links" ADD CONSTRAINT "group_invite_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "budget_categories_group_priority_idx" ON "budget_categories" USING btree ("group_id","priority");--> statement-breakpoint
CREATE INDEX "contributions_group_year_month_idx" ON "contributions" USING btree ("group_id","year","month");--> statement-breakpoint
CREATE INDEX "digest_sends_group_id_idx" ON "digest_sends" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "expense_income_splits_group_expense_idx" ON "expense_income_splits" USING btree ("group_id","expense_id");--> statement-breakpoint
CREATE INDEX "expenses_group_date_idx" ON "expenses" USING btree ("group_id","date");--> statement-breakpoint
CREATE INDEX "income_sources_group_user_id_idx" ON "income_sources" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "joint_account_deposit_splits_group_transaction_idx" ON "joint_account_deposit_splits" USING btree ("group_id","transaction_id");--> statement-breakpoint
CREATE INDEX "joint_account_transactions_group_date_idx" ON "joint_account_transactions" USING btree ("group_id","date");--> statement-breakpoint
CREATE INDEX "members_group_id_idx" ON "members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "savings_goal_contributions_group_goal_idx" ON "savings_goal_contributions" USING btree ("group_id","goal_id");--> statement-breakpoint
CREATE INDEX "savings_goals_group_created_at_idx" ON "savings_goals" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "group_invitations_group_id_idx" ON "group_invitations" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_invitations_email_idx" ON "group_invitations" USING btree ("group_id","email");--> statement-breakpoint
CREATE INDEX "group_invite_contacts_group_id_idx" ON "group_invite_contacts" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_invite_links_group_id_idx" ON "group_invite_links" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_invite_links_token_hash_idx" ON "group_invite_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "group_memberships_user_id_idx" ON "group_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "groups_created_by_user_id_idx" ON "groups" USING btree ("created_by_user_id");