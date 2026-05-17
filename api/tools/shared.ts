import { z } from "zod";

export const ScheduleItemSchema = z.object({
	name: z
		.string()
		.min(1)
		.describe(
			"The item label as it appears on the source (e.g. 'PRELONE/B12', 'PAPA')",
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
		.array(z.string().regex(/^\d{2}:\d{2}$/))
		.min(1)
		.describe("Times of day in 24h HH:mm format, e.g. ['06:44', '14:00']"),
	frequencyHours: z.number().optional(),
	durationDays: z.number().optional(),
	notes: z.string().optional(),
});
export type ScheduleItem = z.infer<typeof ScheduleItemSchema>;

export const ScheduleItemsSchema = z.array(ScheduleItemSchema);

export const EnrichmentSchema = z.object({
	breedNotes: z.string(),
	ageNotes: z.string(),
	conditionNotes: z.string(),
	citations: z.array(
		z.object({
			title: z.string(),
			url: z.string(),
		}),
	),
	generatedAt: z.string(),
	sourceQuery: z.string(),
});
export type Enrichment = z.infer<typeof EnrichmentSchema>;

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
