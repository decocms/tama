-- Recordings (audio of vet visits / voice memos) + per-chunk transcripts.
CREATE TABLE `recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`original_file_id` text,
	`original_name` text,
	`mime_type` text NOT NULL,
	`duration_s` real,
	`num_chunks` integer NOT NULL DEFAULT 0,
	`status` text NOT NULL DEFAULT 'uploading',
	`full_transcript` text,
	`summary` text,
	`history_update` text,
	`episode_note_id` text,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`original_file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`episode_note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `recording_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text NOT NULL,
	`idx` integer NOT NULL,
	`file_id` text,
	`start_s` real NOT NULL,
	`end_s` real NOT NULL,
	`transcript` text,
	`transcribed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_recordings_episode` ON `recordings` (`episode_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chunks_recording_idx` ON `recording_chunks` (`recording_id`, `idx`);
--> statement-breakpoint
-- 'recording' kind for files
-- (text column already accepts any value; the schema enum is loose at SQL level)
