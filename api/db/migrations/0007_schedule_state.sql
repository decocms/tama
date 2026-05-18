-- Live schedule state per item per episode. The prescriptions table remains
-- the source-of-truth template ("X every 8h at these times"); this table
-- holds the runtime state that drifts as the user gives, snoozes, or skips.
--
-- The timetable is derived from anchor_at + N * interval_hours forward,
-- plus the historical doses rows for past administrations. Every dose log
-- advances anchor_at to given_at + interval (cascading drift). Every snooze
-- bumps anchor_at by the snooze amount. No more marker doses or two-pass
-- adjustments — the math lives in one column.

CREATE TABLE IF NOT EXISTS `schedule_state` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL REFERENCES `episodes`(`id`) ON DELETE CASCADE,
	`item_key` text NOT NULL,
	`display_name` text NOT NULL,
	`kind` text NOT NULL DEFAULT 'medication',
	`dosage` text,
	`route` text,
	`notes` text,
	`interval_hours` real NOT NULL,
	`anchor_at` text NOT NULL,
	`duration_days` integer,
	`prescription_id` text REFERENCES `prescriptions`(`id`) ON DELETE SET NULL,
	`active` integer NOT NULL DEFAULT 1,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	`updated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	UNIQUE(`episode_id`, `item_key`)
);

CREATE INDEX IF NOT EXISTS `idx_schedule_state_episode`
	ON `schedule_state` (`episode_id`);
