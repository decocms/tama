-- Web Push (VAPID) plumbing.
--
-- push_subscriptions: one row per browser/device that opted in. The endpoint
-- is the per-browser URL we POST encrypted payloads to (FCM/Mozilla/APNs);
-- p256dh + auth are the subscriber's key material used to encrypt the payload
-- per RFC 8291. Single-tenant for now (everything belongs to Beto) but
-- pet_id is recorded so we can route per-pet later without a migration.
--
-- notifications_sent: idempotency log. (schedule_state_id, planned_at) is
-- unique — the scheduler does INSERT OR IGNORE so an overlapping cron tick
-- can't double-fire the same reminder.

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`pet_id` text REFERENCES `pets`(`id`) ON DELETE SET NULL,
	`endpoint` text NOT NULL UNIQUE,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS `idx_push_subscriptions_pet`
	ON `push_subscriptions` (`pet_id`);

CREATE TABLE IF NOT EXISTS `notifications_sent` (
	`schedule_state_id` text NOT NULL,
	`planned_at` text NOT NULL,
	`sent_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	PRIMARY KEY(`schedule_state_id`, `planned_at`)
);

CREATE INDEX IF NOT EXISTS `idx_notifications_sent_sent_at`
	ON `notifications_sent` (`sent_at`);
