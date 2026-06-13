-- The pet's care team — the veterinarians and specialists involved in this
-- pet's care. Reference data (a roster shown on the Pet page + consulted by the
-- agent), NOT a timeline event. active=0 keeps a former provider on record
-- without cluttering the live roster. New, additive table — safe on every row.
CREATE TABLE IF NOT EXISTS vet_team (
	id TEXT PRIMARY KEY,
	pet_id TEXT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	role TEXT,
	clinic TEXT,
	phone TEXT,
	email TEXT,
	notes TEXT,
	active INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_vet_team_pet ON vet_team(pet_id, created_at);
