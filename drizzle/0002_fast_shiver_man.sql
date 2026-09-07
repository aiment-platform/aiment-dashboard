ALTER TABLE `milestones` ADD `owner_id` text;--> statement-breakpoint
ALTER TABLE `objectives` ADD `sort_order` integer DEFAULT 0 NOT NULL;