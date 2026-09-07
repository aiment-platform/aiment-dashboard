CREATE TABLE `block_workers` (
	`id` text PRIMARY KEY NOT NULL,
	`milestone_id` text NOT NULL,
	`member_id` text NOT NULL,
	`started_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bw_milestone_idx` ON `block_workers` (`milestone_id`);--> statement-breakpoint
CREATE INDEX `bw_member_idx` ON `block_workers` (`member_id`);