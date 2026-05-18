-- AI Insights for an episode. Separate table (not on episodes) so we can
-- keep history of generated insight runs.

CREATE TABLE IF NOT EXISTS `episode_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL REFERENCES `episodes`(`id`) ON DELETE CASCADE,
	`bullets_json` text NOT NULL DEFAULT '[]',
	`raw_ai_text` text,
	`generated_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS `idx_episode_insights_episode`
	ON `episode_insights` (`episode_id`, `generated_at`);
