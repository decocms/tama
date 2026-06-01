-- Parallel SVG sprite pack — same shape as sprite_pack_json (6 states) but
-- stores SVG strings directly. The companion prefers svg_pack_json over
-- sprite_pack_json when both are set, since SVG scales crisply at any
-- viewport size while the raster pack pixelates above its native 64×64.
--
-- Trade-off in plain English:
--   sprite_pack_json (raster, img2img): photo-grounded, expressive, but
--     scaling beyond 64px shows aliasing. Each PNG is a separate R2 round
--     trip. ~30-60s to generate (6 model calls), nontrivial Workers AI cost.
--   svg_pack_json (vector, template):  geometry-based, fully crisp at any
--     size, no R2, no model calls. Generated from the same character
--     sheet (Claude vision pass) but rendered procedurally in api/ai/
--     render-sprite-svg.ts. ~1s, ~free.
--
-- Owners pick whichever they prefer; the schema supports both indefinitely.

ALTER TABLE pets ADD COLUMN svg_pack_json text;
