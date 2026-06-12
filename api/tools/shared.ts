import { z } from "zod";

export const ScheduleItemSchema = z.object({
	name: z
		.string()
		.min(1)
		.describe(
			"The item label as it would appear on the timetable. Reuse the EXACT name an existing schedule_state row already has when re-prescribing the same drug (the canonical name is its display_name) — otherwise a slightly different label like 'Sucrafilm Flaconete' vs 'SUCRAFILM' creates a SECOND timetable row instead of updating the first. Call schedule_state_list first if you're not sure.",
		),
	kind: z
		.enum(["medication", "meal"])
		.describe(
			"medication = drug/supplement; meal = food (e.g. 'papa', 'comida', 'ração', 'food', 'meal')",
		),
	dosage: z
		.string()
		.optional()
		.describe("Amount per administration (e.g. '5mg', '1 scoop')"),
	route: z
		.string()
		.optional()
		.describe("Administration route (oral, subq, topical)"),
	times: z
		.array(z.string().regex(/^\d{1,2}:\d{2}$/))
		.optional()
		.describe(
			"Times of day in 24h HH:mm, interpreted in the PET's timezone (never UTC). Example: ['07:30','14:30','22:00'] = 3×/day. Combine with frequencyHours for every-N-days: times ['10:00'] + frequencyHours 48 → 10:00 every other day (anchored on startsAt). OMIT or pass [] for a pure even-interval schedule driven only by frequencyHours + startsAt (e.g. every 8h round the clock).",
		),
	frequencyHours: z.coerce
		.number()
		.optional()
		.describe(
			"Interval between doses in hours. >24 means every-N-days (48 = every other day, 72 = every third). With `times` set, the time-of-day is the anchor and intermediate days are skipped; without `times`, doses walk forward purely from startsAt at this interval.",
		),
	durationDays: z.coerce.number().optional(),
	startsAt: z
		.string()
		.optional()
		.describe(
			"Optional ISO timestamp (UTC) for when this treatment first started. Use when the prescription began before today and you want the anchor/lifecycle to count from the real start — e.g. 'Hemax started 2026-05-18' on a prescription you're recording later. If omitted, defaults to now (or the latest known dose for this item).",
		),
	notes: z.string().optional(),
});
export type ScheduleItem = z.infer<typeof ScheduleItemSchema>;

export const ScheduleItemsSchema = z.array(ScheduleItemSchema);

export const AdjustmentSchema = z.object({
	kind: z.literal("shift-next-by-h"),
	hours: z.number().describe("Positive = push later, negative = pull earlier"),
});
export type Adjustment = z.infer<typeof AdjustmentSchema>;

export const TimetableEntrySchema = z.object({
	id: z.string(),
	itemName: z.string(),
	kind: z.enum(["medication", "meal"]),
	scheduledAt: z.string().describe("ISO timestamp"),
	dosage: z.string().optional(),
	route: z.string().optional(),
	notes: z.string().optional(),
	prescriptionId: z.string(),
	status: z.enum(["pending", "given", "skipped"]),
	doseId: z.string().optional(),
});
export type TimetableEntry = z.infer<typeof TimetableEntrySchema>;
