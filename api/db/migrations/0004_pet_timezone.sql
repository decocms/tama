-- Per-pet IANA timezone (e.g. "America/Sao_Paulo"). Used to interpret
-- prescription HH:mm as wall-clock time when deriving the timetable.
ALTER TABLE `pets` ADD COLUMN `timezone` text;
