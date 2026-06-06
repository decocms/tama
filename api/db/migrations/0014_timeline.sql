-- Tama v2: delete the episode model, key everything to the singleton pet,
-- introduce the continuous-timeline typed tables.
--
-- The old shape was pet → episodes → {notes, prescriptions, doses,
-- schedule_state, recordings, exams, episode_insights}. There are no episodes
-- anymore: every record hangs directly off the single pet (`pet_self`, seeded
-- in 0011) and the timeline is a query-time merge across the typed tables.
--
-- SQLite can't rename/drop a column or change a FK in place, so each affected
-- table is rebuilt. Critically, ALL copies happen FIRST while the original
-- tables are still pristine — otherwise dropping a parent (e.g. notes) would
-- fire ON DELETE SET NULL on a child (recordings.episode_note_id) and lose the
-- link before we copied it. So: Phase A copy-all, Phase B drop-all, Phase C
-- rename-all, Phase D indexes + new tables + columns. defer_foreign_keys lets
-- the FK references resolve at COMMIT (after the renames).

PRAGMA defer_foreign_keys = TRUE;

-- ===== Phase A: create *_new and copy from the still-intact originals =====
-- pet_id is always 'pet_self' (0011 already collapsed every row to it).

CREATE TABLE notes_new (
	id text PRIMARY KEY NOT NULL,
	pet_id text NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
	kind text NOT NULL,
	content text NOT NULL,
	ai_summary text,
	created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO notes_new (id, pet_id, kind, content, ai_summary, created_at)
	SELECT id, 'pet_self', kind, content, ai_summary, created_at FROM notes;

CREATE TABLE prescriptions_new (
	id text PRIMARY KEY NOT NULL,
	pet_id text NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
	file_id text REFERENCES files(id) ON DELETE SET NULL,
	status text NOT NULL DEFAULT 'draft',
	schedule_items_json text NOT NULL DEFAULT '[]',
	raw_ai_text text,
	source_notes text,
	created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO prescriptions_new (id, pet_id, file_id, status, schedule_items_json, raw_ai_text, source_notes, created_at)
	SELECT id, 'pet_self', file_id, status, schedule_items_json, raw_ai_text, source_notes, created_at FROM prescriptions;

CREATE TABLE doses_new (
	id text PRIMARY KEY NOT NULL,
	pet_id text NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
	item_name text NOT NULL,
	kind text NOT NULL DEFAULT 'medication',
	planned_at text,
	actual_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	status text NOT NULL DEFAULT 'given',
	note text,
	adjustment_json text,
	created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO doses_new (id, pet_id, item_name, kind, planned_at, actual_at, status, note, adjustment_json, created_at)
	SELECT id, 'pet_self', item_name, kind, planned_at, actual_at, status, note, adjustment_json, created_at FROM doses;

CREATE TABLE schedule_state_new (
	id text PRIMARY KEY NOT NULL,
	pet_id text NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
	item_key text NOT NULL,
	display_name text NOT NULL,
	kind text NOT NULL DEFAULT 'medication',
	dosage text,
	route text,
	notes text,
	interval_hours real NOT NULL,
	anchor_at text NOT NULL,
	duration_days integer,
	prescription_id text REFERENCES prescriptions(id) ON DELETE SET NULL,
	active integer NOT NULL DEFAULT 1,
	starts_at text,
	ends_at text,
	created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	UNIQUE (pet_id, item_key)
);
INSERT INTO schedule_state_new (id, pet_id, item_key, display_name, kind, dosage, route, notes, interval_hours, anchor_at, duration_days, prescription_id, active, starts_at, ends_at, created_at, updated_at)
	SELECT id, 'pet_self', item_key, display_name, kind, dosage, route, notes, interval_hours, anchor_at, duration_days, prescription_id, active, starts_at, ends_at, created_at, updated_at FROM schedule_state;

CREATE TABLE recordings_new (
	id text PRIMARY KEY NOT NULL,
	pet_id text NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
	original_file_id text REFERENCES files(id) ON DELETE SET NULL,
	original_name text,
	mime_type text NOT NULL,
	duration_s real,
	num_chunks integer NOT NULL DEFAULT 0,
	status text NOT NULL DEFAULT 'uploading',
	full_transcript text,
	summary text,
	history_update text,
	episode_note_id text REFERENCES notes(id) ON DELETE SET NULL,
	error text,
	created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO recordings_new (id, pet_id, original_file_id, original_name, mime_type, duration_s, num_chunks, status, full_transcript, summary, history_update, episode_note_id, error, created_at)
	SELECT id, 'pet_self', original_file_id, original_name, mime_type, duration_s, num_chunks, status, full_transcript, summary, history_update, episode_note_id, error, created_at FROM recordings;

CREATE TABLE exams_new (
	id text PRIMARY KEY NOT NULL,
	pet_id text NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
	file_id text REFERENCES files(id) ON DELETE SET NULL,
	status text NOT NULL DEFAULT 'draft',
	performed_at text,
	lab_name text,
	request_id text,
	raw_ai_text text,
	source_notes text,
	created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO exams_new (id, pet_id, file_id, status, performed_at, lab_name, request_id, raw_ai_text, source_notes, created_at)
	SELECT id, 'pet_self', file_id, status, performed_at, lab_name, request_id, raw_ai_text, source_notes, created_at FROM exams;

-- ===== Phase B: drop originals (copies are safe in *_new) =====
DROP TABLE schedule_state;
DROP TABLE recordings;
DROP TABLE doses;
DROP TABLE exams;
DROP TABLE prescriptions;
DROP TABLE notes;
DROP TABLE IF EXISTS episode_insights;
DROP TABLE IF EXISTS episodes;

-- ===== Phase C: rename *_new into place =====
ALTER TABLE notes_new RENAME TO notes;
ALTER TABLE prescriptions_new RENAME TO prescriptions;
ALTER TABLE doses_new RENAME TO doses;
ALTER TABLE schedule_state_new RENAME TO schedule_state;
ALTER TABLE recordings_new RENAME TO recordings;
ALTER TABLE exams_new RENAME TO exams;

-- ===== Phase D: indexes, new typed tables, pet summary columns =====
CREATE INDEX idx_notes_pet ON notes (pet_id, created_at);
CREATE INDEX idx_prescriptions_pet ON prescriptions (pet_id, created_at);
CREATE INDEX idx_doses_pet ON doses (pet_id, actual_at);
CREATE INDEX idx_schedule_state_pet ON schedule_state (pet_id);
CREATE INDEX idx_recordings_pet ON recordings (pet_id, created_at);
CREATE INDEX idx_exams_pet ON exams (pet_id, performed_at);

CREATE TABLE vet_visits (
	id text PRIMARY KEY NOT NULL,
	pet_id text NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
	visited_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	vet_name text,
	clinic text,
	reason text,
	notes text,
	file_id text REFERENCES files(id) ON DELETE SET NULL,
	created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_vet_visits_pet ON vet_visits (pet_id, visited_at);

CREATE TABLE vaccines (
	id text PRIMARY KEY NOT NULL,
	pet_id text NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
	name text NOT NULL,
	administered_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	due_at text,
	lot text,
	vet_name text,
	file_id text REFERENCES files(id) ON DELETE SET NULL,
	created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_vaccines_pet ON vaccines (pet_id, administered_at);

CREATE TABLE symptoms (
	id text PRIMARY KEY NOT NULL,
	pet_id text NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
	observed_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	description text NOT NULL,
	severity text,
	resolved_at text,
	created_at text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_symptoms_pet ON symptoms (pet_id, observed_at);

ALTER TABLE pets ADD COLUMN summary text;
ALTER TABLE pets ADD COLUMN summary_at text;
