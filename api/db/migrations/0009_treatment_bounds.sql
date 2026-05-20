-- Treatment lifecycle bounds per scheduled item.
--
-- starts_at: when this treatment began (defaults to the row's created_at).
-- ends_at:   when it ends. Auto-derived from duration_days on creation, but
--            users can override (extend, end early, or remove the bound).
--
-- The scheduler/timetable_get consult ends_at to auto-deactivate finished
-- treatments — once now > ends_at, active is flipped to 0 on the next read
-- so the medicine stops appearing in the timetable without a manual step.
-- The prescriptions table stays as the immutable template; this is the
-- per-episode live lifecycle.

ALTER TABLE `schedule_state` ADD COLUMN `starts_at` text;
ALTER TABLE `schedule_state` ADD COLUMN `ends_at` text;

-- Backfill: every existing row gets its starts_at = created_at, and ends_at
-- derived from duration_days where present. Items without durationDays stay
-- open-ended.
UPDATE `schedule_state`
SET
	`starts_at` = `created_at`,
	`ends_at` = CASE
		WHEN `duration_days` IS NOT NULL
		THEN strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`, '+' || `duration_days` || ' days')
		ELSE NULL
	END
WHERE `starts_at` IS NULL;
