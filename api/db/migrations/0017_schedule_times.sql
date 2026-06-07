-- Explicit clock times per schedule item, so the timetable can honor
-- irregular schedules (e.g. meals at 07:00 / 14:00 / 22:00) instead of
-- collapsing them to an even interval (24 / count). JSON array of "HH:mm"
-- strings in the pet's timezone. NULL/[] → fall back to interval projection.
ALTER TABLE schedule_state ADD COLUMN times_json TEXT;
