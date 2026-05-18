-- Live status string for an open episode. Updated automatically by
-- episode_insights whenever it generates a "status" bullet — represents the
-- latest one-line read of how the episode is going. Overwritten on each
-- regeneration; history lives in notes.

ALTER TABLE `episodes` ADD COLUMN `current_status` text;
ALTER TABLE `episodes` ADD COLUMN `current_status_at` text;
