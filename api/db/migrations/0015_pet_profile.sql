-- Structured "case file" for the pet — a compact RPG-style character sheet
-- (age, weight, allergies, chronic conditions, active concerns, past episodes,
-- what to watch). Stored as JSON; synthesized by pet_profile_refresh from the
-- owner notes + timeline + exams, and always injected as context into AI
-- research/analysis. Free-text owner_notes stays as the raw source.
ALTER TABLE pets ADD COLUMN profile_json TEXT;
