-- Lab exams: one row per uploaded/pasted lab report, plus one row per
-- extracted metric. The shape mirrors prescriptions — `exams` is the
-- document-level record (lab name, date, optional file), `exam_metrics` is
-- the structured payload that powers the evolution charts.
--
-- `canonical_key` is the linchpin for charting: the LLM is given a curated
-- taxonomy and asked to map every parameter into it (hemoglobin, alt, urea,
-- creatinine, ...). When it sees something outside the taxonomy it proposes
-- a snake_case key and we flag `pending_review = 1`. `metric_aliases` is the
-- audit log for those proposals so we can grow the taxonomy over time
-- without losing data on first contact.
--
-- Reference ranges are stored both numerically (ref_low / ref_high) for
-- chart bands and as raw text (ref_text) for display fidelity when the lab
-- prints something unusual ("< 50 ng/mL", "negative", ...).

CREATE TABLE IF NOT EXISTS `exams` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL REFERENCES `episodes`(`id`) ON DELETE CASCADE,
	`file_id` text REFERENCES `files`(`id`) ON DELETE SET NULL,
	`status` text NOT NULL DEFAULT 'draft',
	`performed_at` text,
	`lab_name` text,
	`request_id` text,
	`raw_ai_text` text,
	`source_notes` text,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS `idx_exams_episode` ON `exams` (`episode_id`);
CREATE INDEX IF NOT EXISTS `idx_exams_performed_at` ON `exams` (`performed_at`);

CREATE TABLE IF NOT EXISTS `exam_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL REFERENCES `exams`(`id`) ON DELETE CASCADE,
	`canonical_key` text,
	`display_name` text NOT NULL,
	`value_num` real,
	`value_text` text,
	`unit` text,
	`ref_low` real,
	`ref_high` real,
	`ref_text` text,
	`status` text NOT NULL DEFAULT 'unknown',
	`pending_review` integer NOT NULL DEFAULT 0,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS `idx_exam_metrics_exam` ON `exam_metrics` (`exam_id`);
CREATE INDEX IF NOT EXISTS `idx_exam_metrics_canonical` ON `exam_metrics` (`canonical_key`, `exam_id`);

CREATE TABLE IF NOT EXISTS `metric_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`proposed_key` text NOT NULL,
	`display_name` text NOT NULL,
	`unit_seen` text,
	`exam_id` text REFERENCES `exams`(`id`) ON DELETE SET NULL,
	`approved` integer NOT NULL DEFAULT 0,
	`mapped_to_key` text,
	`created_at` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS `idx_metric_aliases_proposed` ON `metric_aliases` (`proposed_key`);
