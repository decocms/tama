-- myvet initial schema
CREATE TABLE `pets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`species` text DEFAULT 'dog' NOT NULL,
	`breed` text,
	`dob` text,
	`weight_kg` real,
	`owner_notes` text,
	`enrichment_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`pet_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`ended_at` text,
	`summary` text,
	FOREIGN KEY (`pet_id`) REFERENCES `pets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`ai_summary` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`r2_key` text NOT NULL,
	`original_name` text,
	`mime_type` text NOT NULL,
	`kind` text DEFAULT 'prescription' NOT NULL,
	`uploaded_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prescriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`file_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`schedule_items_json` text DEFAULT '[]' NOT NULL,
	`raw_ai_text` text,
	`source_notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `doses` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`item_name` text NOT NULL,
	`kind` text DEFAULT 'medication' NOT NULL,
	`planned_at` text,
	`actual_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`status` text DEFAULT 'given' NOT NULL,
	`note` text,
	`adjustment_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_episodes_pet` ON `episodes` (`pet_id`);
--> statement-breakpoint
CREATE INDEX `idx_notes_episode` ON `notes` (`episode_id`);
--> statement-breakpoint
CREATE INDEX `idx_rx_episode` ON `prescriptions` (`episode_id`);
--> statement-breakpoint
CREATE INDEX `idx_doses_episode` ON `doses` (`episode_id`);
