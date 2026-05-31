-- Per-pet sprite pack: the JSON map of {idle, happy, hungry, pill-time, sad,
-- sleeping} → R2 URL. Populated by pet_sprite_generate which runs the
-- two-pass img2img pipeline (Claude character sheet → SD base → SD variants).
-- When NULL the companion view falls back to the static placeholder at
-- /companion-sprite.svg, so this column is optional from the runtime's
-- perspective.

ALTER TABLE pets ADD COLUMN sprite_pack_json text;

-- Also store the structured character description we extracted from the
-- source photo so future regenerations (haircut, age) can stay on-model
-- without re-running the vision pass.
ALTER TABLE pets ADD COLUMN character_json text;

-- Pointer to the original photo R2 key (file.r2_key indirection). Useful
-- for the "re-render Tama" button — we keep the original around so the
-- owner doesn't need to re-upload it.
ALTER TABLE pets ADD COLUMN photo_file_id text REFERENCES files(id) ON DELETE SET NULL;
