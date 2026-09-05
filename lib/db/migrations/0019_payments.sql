-- One row per STK Push attempt.
--
-- Written before the prompt is sent, so a callback always has something to
-- reconcile against. Safaricom posts callbacks to a public URL with no
-- signature, so a callback is matched to a row we already created rather than
-- believed on its own.

CREATE TABLE IF NOT EXISTS "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"billing_interval" text NOT NULL,
	"amount_kes" integer NOT NULL,
	"promo_code" text,
	"phone_number" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"merchant_request_id" text,
	"checkout_request_id" text,
	"result_code" integer,
	"result_desc" text,
	"mpesa_receipt_number" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_user_created_idx"
	ON "payments" USING btree ("user_id","created_at");
--> statement-breakpoint
-- Safaricom retries callbacks. This is what stops one payment extending a
-- subscription twice.
CREATE UNIQUE INDEX IF NOT EXISTS "payments_checkout_request_idx"
	ON "payments" USING btree ("checkout_request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_status_idx"
	ON "payments" USING btree ("status");
