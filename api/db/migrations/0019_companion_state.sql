-- Owner-settable companion mood + when it was set. The companion view uses it
-- as the baseline state; live schedule events override it and it goes stale
-- after a window. Append-only ADD COLUMN — safe on existing rows.
ALTER TABLE pets ADD COLUMN companion_state TEXT;
ALTER TABLE pets ADD COLUMN companion_state_at TEXT;
