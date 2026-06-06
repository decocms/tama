-- Saved vet-research runs. Each `vet_research` call (the owner asking a grounded
-- question, or the agent) is logged here so the Pet page can show a history of
-- past researches and let the owner ask new ones.
CREATE TABLE IF NOT EXISTS researches (
	id TEXT PRIMARY KEY,
	pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
	question TEXT NOT NULL,
	answer TEXT NOT NULL,
	key_points_json TEXT,
	cautions_json TEXT,
	citations_json TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_researches_pet ON researches(pet_id, created_at);
