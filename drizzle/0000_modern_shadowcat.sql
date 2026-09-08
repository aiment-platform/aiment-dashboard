CREATE TABLE "activity_log" (
	"id" text PRIMARY KEY NOT NULL,
	"ts" text NOT NULL,
	"actor_type" text DEFAULT 'member' NOT NULL,
	"actor_id" text,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "block_workers" (
	"id" text PRIMARY KEY NOT NULL,
	"milestone_id" text NOT NULL,
	"member_id" text NOT NULL,
	"started_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blockers" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"workstream_id" text NOT NULL,
	"task_id" text,
	"owner_id" text NOT NULL,
	"severity" text DEFAULT 'high' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"resolution" text,
	"resolved_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"auth_user_id" text,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"workstream_id" text NOT NULL,
	"owner_id" text,
	"parent_id" text,
	"important" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"target_value" double precision NOT NULL,
	"current_value" double precision DEFAULT 0 NOT NULL,
	"unit" text,
	"weight" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"due_date" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"board_x" double precision,
	"board_y" double precision,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"owner_id" text NOT NULL,
	"start_date" text,
	"target_date" text,
	"status" text DEFAULT 'active' NOT NULL,
	"confidence" text DEFAULT 'medium' NOT NULL,
	"confidence_note" text,
	"confidence_updated_at" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"workstream_id" text,
	"milestone_id" text,
	"owner_id" text NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"priority" text DEFAULT 'p1' NOT NULL,
	"due_date" text,
	"note" text,
	"completed_at" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "updates" (
	"id" text PRIMARY KEY NOT NULL,
	"workstream_id" text NOT NULL,
	"author_id" text NOT NULL,
	"what" text NOT NULL,
	"result" text,
	"next" text,
	"milestone_id" text,
	"value_before" double precision,
	"value_after" double precision,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"focus_objective_id" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workstreams" (
	"id" text PRIMARY KEY NOT NULL,
	"objective_id" text NOT NULL,
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"health" text DEFAULT 'on_track' NOT NULL,
	"health_note" text,
	"health_updated_at" text NOT NULL,
	"next_action" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "act_ts_idx" ON "activity_log" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "act_entity_idx" ON "activity_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "bw_milestone_idx" ON "block_workers" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "bw_member_idx" ON "block_workers" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "blk_status_idx" ON "blockers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ms_workstream_idx" ON "milestones" USING btree ("workstream_id");--> statement-breakpoint
CREATE INDEX "task_owner_idx" ON "tasks" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "task_workstream_idx" ON "tasks" USING btree ("workstream_id");--> statement-breakpoint
CREATE INDEX "upd_created_idx" ON "updates" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ws_objective_idx" ON "workstreams" USING btree ("objective_id");