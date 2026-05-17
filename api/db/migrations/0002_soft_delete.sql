-- Add soft-delete column to pets and episodes.
ALTER TABLE `pets` ADD COLUMN `deleted_at` text;
--> statement-breakpoint
ALTER TABLE `episodes` ADD COLUMN `deleted_at` text;
--> statement-breakpoint
CREATE INDEX `idx_pets_deleted` ON `pets` (`deleted_at`);
--> statement-breakpoint
CREATE INDEX `idx_episodes_deleted` ON `episodes` (`deleted_at`);
