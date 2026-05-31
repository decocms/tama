-- Collapse from multi-pet to singleton-pet shape.
--
-- The pets table keeps the same schema; we just enforce that exactly one
-- pet row exists, identified by the well-known id 'pet_self'. Everything
-- downstream (episodes, notes, prescriptions, doses, schedule_state,
-- recordings, push_subscriptions, exams, exam_metrics) keeps its current
-- foreign-key shape — pet_id columns continue to exist, they just always
-- point at 'pet_self' now.
--
-- This migration is intentionally minimal. It only seeds the placeholder
-- row when the deploy is empty. For deploys that already have data under
-- a different pet id (e.g. Beto's myvet prod), the rewrite is handled
-- out-of-band by scripts/migrate-beto.ts, not by this migration — that
-- script reshapes ids during the snapshot → reload, so the data lands
-- here already pointed at pet_self.

INSERT OR IGNORE INTO pets (id, name, species, breed, dob, weight_kg, owner_notes, timezone, created_at)
VALUES ('pet_self', 'Tama', 'dog', NULL, NULL, NULL, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
