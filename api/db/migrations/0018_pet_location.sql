-- Owner-facing location label (e.g. "Rio de Janeiro"), separate from the IANA
-- timezone. America/Sao_Paulo covers all of southeastern Brazil (Rio included),
-- so a city derived from the timezone is ambiguous — store the real one.
ALTER TABLE pets ADD COLUMN location TEXT;
