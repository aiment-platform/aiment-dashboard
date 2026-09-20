CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'user' NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"handle" text,
	"discord" text,
	"email" text,
	"url" text,
	"note" text,
	"owner_id" text,
	"last_contacted_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ct_status_idx" ON "contacts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ct_kind_idx" ON "contacts" USING btree ("kind");