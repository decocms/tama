import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../env.ts";
import { listDoses } from "../storage/doses.ts";
import {
	addNote,
	deleteEpisode,
	endEpisode,
	getEpisode,
	listEpisodes,
	listNotes,
	startEpisode,
} from "../storage/episodes.ts";
import {
	listPrescriptions,
	parseScheduleItems,
} from "../storage/prescriptions.ts";
import { deriveTimetable } from "../storage/timetable.ts";
import { TimetableEntrySchema } from "./shared.ts";
import { URI } from "./uris.ts";

const EpisodeSchema = z.object({
	id: z.string(),
	petId: z.string(),
	title: z.string(),
	status: z.enum(["open", "closed"]),
	startedAt: z.string(),
	endedAt: z.string().nullable(),
	summary: z.string().nullable(),
});

const NoteSchema = z.object({
	id: z.string(),
	episodeId: z.string(),
	kind: z.enum(["text", "chatlog", "ai-summary"]),
	content: z.string(),
	aiSummary: z.string().nullable(),
	createdAt: z.string(),
});

const PrescriptionSummarySchema = z.object({
	id: z.string(),
	status: z.enum(["draft", "confirmed"]),
	itemCount: z.number(),
	fileId: z.string().nullable(),
	createdAt: z.string(),
});

export const episodeStartTool = (_env: Env) =>
	createTool({
		id: "episode_start",
		description:
			"Start a new care episode for a pet (illness, treatment cycle, etc.).",
		inputSchema: z.object({
			petId: z.string(),
			title: z.string(),
			summary: z.string().optional(),
		}),
		outputSchema: z.object({ episode: EpisodeSchema }),
		_meta: { ui: { resourceUri: URI.episodeStart } },
		execute: async ({ context, runtimeContext }) => {
			const ep = await startEpisode(runtimeContext.env as Env, context);
			return { episode: ep };
		},
	});

export const episodeGetTool = (_env: Env) =>
	createTool({
		id: "episode_get",
		description:
			"Get an episode dashboard: timetable for the next 48h, recent doses, prescriptions and notes.",
		inputSchema: z.object({
			episodeId: z.string(),
			windowHours: z.number().optional().describe("Defaults to 48"),
		}),
		outputSchema: z.object({
			episode: EpisodeSchema.nullable(),
			timetable: z.array(TimetableEntrySchema),
			prescriptions: z.array(PrescriptionSummarySchema),
			notes: z.array(NoteSchema),
		}),
		_meta: { ui: { resourceUri: URI.episodeGet } },
		annotations: { readOnlyHint: true },
		execute: async ({ context, runtimeContext }) => {
			const e = runtimeContext.env as Env;
			const ep = await getEpisode(e, context.episodeId);
			if (!ep)
				return { episode: null, timetable: [], prescriptions: [], notes: [] };

			const window = context.windowHours ?? 48;
			const from = new Date();
			from.setMinutes(0, 0, 0);
			from.setHours(from.getHours() - 6); // include last few hours for context
			const to = new Date(from.getTime() + window * 60 * 60 * 1000);

			const [rxRows, doseRows, noteRows] = await Promise.all([
				listPrescriptions(e, ep.id),
				listDoses(e, ep.id),
				listNotes(e, ep.id),
			]);

			const timetable = deriveTimetable({
				prescriptions: rxRows,
				doses: doseRows,
				from,
				to,
				episodeStartedAt: new Date(ep.startedAt),
			});

			return {
				episode: ep,
				timetable,
				prescriptions: rxRows.map((r) => ({
					id: r.id,
					status: r.status,
					itemCount: parseScheduleItems(r).length,
					fileId: r.fileId,
					createdAt: r.createdAt,
				})),
				notes: noteRows,
			};
		},
	});

export const episodeListTool = (_env: Env) =>
	createTool({
		id: "episode_list",
		description: "List episodes (optionally filtered by pet).",
		inputSchema: z.object({ petId: z.string().optional() }),
		outputSchema: z.object({ episodes: z.array(EpisodeSchema) }),
		_meta: { ui: { resourceUri: URI.episodeList } },
		annotations: { readOnlyHint: true },
		execute: async ({ context, runtimeContext }) => {
			const eps = await listEpisodes(runtimeContext.env as Env, context.petId);
			return { episodes: eps };
		},
	});

export const episodeEndTool = (_env: Env) =>
	createTool({
		id: "episode_end",
		description: "Close an episode (treatment complete or paused).",
		inputSchema: z.object({
			episodeId: z.string(),
			summary: z.string().optional(),
		}),
		outputSchema: z.object({ episode: EpisodeSchema.nullable() }),
		execute: async ({ context, runtimeContext }) => {
			const ep = await endEpisode(
				runtimeContext.env as Env,
				context.episodeId,
				context.summary,
			);
			return { episode: ep };
		},
	});

export const episodeAddNoteTool = (_env: Env) =>
	createTool({
		id: "episode_add_note",
		description:
			"Add a note to an episode. kind='text' for plain notes, 'chatlog' for pasted message history (no AI processing in this MVP — store as-is).",
		inputSchema: z.object({
			episodeId: z.string(),
			kind: z.enum(["text", "chatlog"]).default("text"),
			content: z.string(),
		}),
		outputSchema: z.object({ note: NoteSchema }),
		execute: async ({ context, runtimeContext }) => {
			const note = await addNote(runtimeContext.env as Env, {
				episodeId: context.episodeId,
				kind: context.kind,
				content: context.content,
			});
			return { note };
		},
	});

export const episodeDeleteTool = (_env: Env) =>
	createTool({
		id: "episode_delete",
		description:
			"Soft-delete an episode. Notes, prescriptions, and doses stay in the database; the episode is just hidden from listings.",
		inputSchema: z.object({ episodeId: z.string() }),
		outputSchema: z.object({ deleted: z.boolean() }),
		annotations: { destructiveHint: true },
		execute: async ({ context, runtimeContext }) => {
			const ok = await deleteEpisode(
				runtimeContext.env as Env,
				context.episodeId,
			);
			return { deleted: ok };
		},
	});
