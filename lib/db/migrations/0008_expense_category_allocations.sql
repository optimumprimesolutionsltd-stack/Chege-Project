CREATE TABLE "expense_category_allocations" (
  "id" serial PRIMARY KEY NOT NULL,
  "group_id" integer NOT NULL,
  "expense_id" integer NOT NULL,
  "category" text NOT NULL,
  "amount" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "expense_category_allocations_expense_category_unique" UNIQUE("expense_id","category")
);
--> statement-breakpoint
ALTER TABLE "expense_category_allocations" ADD CONSTRAINT "expense_category_allocations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "expense_category_allocations" ADD CONSTRAINT "expense_category_allocations_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "expense_category_allocations_group_expense_idx" ON "expense_category_allocations" USING btree ("group_id","expense_id");
--> statement-breakpoint
CREATE INDEX "expense_category_allocations_group_category_idx" ON "expense_category_allocations" USING btree ("group_id","category");