import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../env.ts";
import { addSymptom, listSymptoms, resolveSymptom } from "../storage/symptoms.ts";
import { addNote, getTimeline } from "../storage/timeline.ts";
import { addVaccine, listVaccines } from "../storage/vaccines.ts";
import { addVetVisit, listVetVisits } from "../storage/vet-visits.ts";
import { URI } from "./uris.ts";

const TIMELINE_TYPES = [
	"note",
	"dose",
	"exam",
	"recording",
	"vet-visit",
	"vaccine",
	"symptom",
	"prescription",
] as const;

const TimelineEntrySchema = z.object({
	id: z.string(),
	type: z.enum(TIMELINE_TYPES),
	at: z.string(),
	title: z.string(),
	detail: z.string().nullable(),
	refId: z.string(),
	status: z.string().nullable(),
});

export const timelineGetTool = (_env: Env) =>
	createTool({
		id: "timeline_get",
		description:
			"The pet's continuous timeline — every logged event (vet visits, vaccines, symptoms, doses, exams, recordings, notes, prescriptions) merged into one reverse-chronological feed. This is the full context of the pet's life. Filter by kinds or cap with limit.",
		inputSchema: z.object({
			kinds: z.array(z.enum(TIMELINE_TYPES)).optional(),
			limit: z.coerce.number().optional(),
		}),
		outputSchema: z.object({ entries: z.array(TimelineEntrySchema) }),
		_meta: { ui: { resourceUri: URI.timeline } },
		annotations: { readOnlyHint: true },
		execute: async ({ context, runtimeContext }) => {
			const entries = await getTimeline(runtimeContext.env as Env, {
				kinds: context.kinds,
				limit: context.limit,
			});
			return { entries };
		},
	});

export const timelineNoteAddTool = (_env: Env) =>
	createTool({
		id: "timeline_note_add",
		description:
			"Add a free-form note to the pet's timeline. Use kind='general' for a logged observation, 'chatlog' for pasted message history, 'text' for a plain note.",
		inputSchema: z.object({
			content: z.string().min(1),
			kind: z.enum(["text", "chatlog", "general"]).default("general"),
		}),
		outputSchema: z.object({ noteId: z.string() }),
		execute: async ({ context, runtimeContext }) => {
			const note = await addNote(runtimeContext.env as Env, {
				kind: context.kind,
				content: context.content,
			});
			return { noteId: note.id };
		},
	});

export const vetVisitAddTool = (_env: Env) =>
	createTool({
		id: "vet_visit_add",
		description:
			"Log a vet appointment on the timeline (visit date, clinic, vet, reason, notes). Optionally link a file in the Assets library (a discharge note or invoice).",
		inputSchema: z.object({
			visitedAt: z.string().optional().describe("ISO timestamp; defaults to now."),
			vetName: z.string().optional(),
			clinic: z.string().optional(),
			reason: z.string().optional(),
			notes: z.string().optional(),
			fileId: z.string().optional(),
		}),
		outputSchema: z.object({ id: z.string() }),
		execute: async ({ context, runtimeContext }) => {
			const v = await addVetVisit(runtimeContext.env as Env, context);
			return { id: v.id };
		},
	});

export const vetVisitListTool = (_env: Env) =>
	createTool({
		id: "vet_visit_list",
		description: "List the pet's vet visits, most recent first.",
		inputSchema: z.object({}),
		outputSchema: z.object({
			visits: z.array(
				z.object({
					id: z.string(),
					visitedAt: z.string(),
					vetName: z.string().nullable(),
					clinic: z.string().nullable(),
					reason: z.string().nullable(),
					notes: z.string().nullable(),
					fileId: z.string().nullable(),
				}),
			),
		}),
		annotations: { readOnlyHint: true },
		execute: async ({ runtimeContext }) => {
			const visits = await listVetVisits(runtimeContext.env as Env);
			return {
				visits: visits.map((v) => ({
					id: v.id,
					visitedAt: v.visitedAt,
					vetName: v.vetName,
					clinic: v.clinic,
					reason: v.reason,
					notes: v.notes,
					fileId: v.fileId,
				})),
			};
		},
	});

export const vaccineAddTool = (_env: Env) =>
	createTool({
		id: "vaccine_add",
		description:
			"Log a vaccination (name, date given, optional next-due date, lot, vet). Shows on the timeline; dueAt can drive a reminder later.",
		inputSchema: z.object({
			name: z.string().min(1),
			administeredAt: z.string().optional().describe("ISO; defaults to now."),
			dueAt: z.string().optional(),
			lot: z.string().optional(),
			vetName: z.string().optional(),
			fileId: z.string().optional(),
		}),
		outputSchema: z.object({ id: z.string() }),
		execute: async ({ context, runtimeContext }) => {
			const v = await addVaccine(runtimeContext.env as Env, context);
			return { id: v.id };
		},
	});

export const vaccineListTool = (_env: Env) =>
	createTool({
		id: "vaccine_list",
		description: "List the pet's vaccinations, most recent first.",
		inputSchema: z.object({}),
		outputSchema: z.object({
			vaccines: z.array(
				z.object({
					id: z.string(),
					name: z.string(),
					administeredAt: z.string(),
					dueAt: z.string().nullable(),
					lot: z.string().nullable(),
					vetName: z.string().nullable(),
					fileId: z.string().nullable(),
				}),
			),
		}),
		annotations: { readOnlyHint: true },
		execute: async ({ runtimeContext }) => {
			const vaccines = await listVaccines(runtimeContext.env as Env);
			return {
				vaccines: vaccines.map((v) => ({
					id: v.id,
					name: v.name,
					administeredAt: v.administeredAt,
					dueAt: v.dueAt,
					lot: v.lot,
					vetName: v.vetName,
					fileId: v.fileId,
				})),
			};
		},
	});

export const symptomAddTool = (_env: Env) =>
	createTool({
		id: "symptom_add",
		description:
			"Log an observed symptom (description, when first seen, severity). Leave resolvedAt empty for ongoing; call symptom_resolve later when it clears.",
		inputSchema: z.object({
			description: z.string().min(1),
			observedAt: z.string().optional().describe("ISO; defaults to now."),
			severity: z.enum(["mild", "moderate", "severe"]).optional(),
			resolvedAt: z.string().optional(),
		}),
		outputSchema: z.object({ id: z.string() }),
		execute: async ({ context, runtimeContext }) => {
			const s = await addSymptom(runtimeContext.env as Env, context);
			return { id: s.id };
		},
	});

export const symptomResolveTool = (_env: Env) =>
	createTool({
		id: "symptom_resolve",
		description: "Mark a previously-logged symptom as resolved.",
		inputSchema: z.object({
			id: z.string(),
			resolvedAt: z.string().optional().describe("ISO; defaults to now."),
		}),
		outputSchema: z.object({ resolved: z.boolean() }),
		execute: async ({ context, runtimeContext }) => {
			const s = await resolveSymptom(
				runtimeContext.env as Env,
				context.id,
				context.resolvedAt,
			);
			return { resolved: !!s };
		},
	});

export const symptomListTool = (_env: Env) =>
	createTool({
		id: "symptom_list",
		description: "List the pet's symptoms, most recent first.",
		inputSchema: z.object({}),
		outputSchema: z.object({
			symptoms: z.array(
				z.object({
					id: z.string(),
					description: z.string(),
					observedAt: z.string(),
					severity: z.string().nullable(),
					resolvedAt: z.string().nullable(),
				}),
			),
		}),
		annotations: { readOnlyHint: true },
		execute: async ({ runtimeContext }) => {
			const symptoms = await listSymptoms(runtimeContext.env as Env);
			return {
				symptoms: symptoms.map((s) => ({
					id: s.id,
					description: s.description,
					observedAt: s.observedAt,
					severity: s.severity,
					resolvedAt: s.resolvedAt,
				})),
			};
		},
	});

