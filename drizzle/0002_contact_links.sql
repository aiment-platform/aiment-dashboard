CREATE TABLE "contact_links" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"channel" text NOT NULL,
	"value" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "summary" text;--> statement-breakpoint
CREATE INDEX "cl_contact_idx" ON "contact_links" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "cl_channel_idx" ON "contact_links" USING btree ("channel");