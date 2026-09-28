CREATE TABLE "block_links" (
	"id" text PRIMARY KEY NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_items" (
	"id" text PRIMARY KEY NOT NULL,
	"objective_id" text NOT NULL,
	"type" text NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL,
	"w" double precision DEFAULT 0 NOT NULL,
	"h" double precision DEFAULT 0 NOT NULL,
	"color" text,
	"data" text DEFAULT '{}' NOT NULL,
	"created_by" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "milestones" ADD COLUMN "kind" text DEFAULT 'task' NOT NULL;--> statement-breakpoint
CREATE INDEX "bl_from_idx" ON "block_links" USING btree ("from_id");--> statement-breakpoint
CREATE INDEX "bl_to_idx" ON "block_links" USING btree ("to_id");--> statement-breakpoint
CREATE INDEX "bi_objective_idx" ON "board_items" USING btree ("objective_id");