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
	updateEpisode,
} from "../storage/episodes.ts";
import { getSelfPet, PET_SELF_ID } from "../storage/pet-self.ts";
import {
	listPrescriptions,
	parseScheduleItems,
} from "../storage/prescriptions.ts";
import {
	ensureScheduleStateForEpisode,
	listScheduleStates,
} from "../storage/schedule-state.ts";
import {
	deriveTimetable,
	startOfDayInZone,
	wallClockToIso,
} from "../storage/timetable.ts";
import { ScheduleItemSchema, TimetableEntrySchema } from "./shared.ts";
import { URI } from "./uris.ts";

const EpisodeSchema = z.object({
	id: z.string(),
	petId: z.string(),
	title: z.string(),
	status: z.enum(["open", "closed"]),
	startedAt: z.string(),
	endedAt: z.string().nullable(),
	summary: z.string().nullable(),
	currentStatus: z.string().nullable(),
	currentStatusAt: z.string().nullable(),
	deletedAt: z.string().nullable(),
});

const NoteSchema = z.object({
	id: z.string(),
	episodeId: z.string(),
	kind: z.enum(["text", "chatlog", "ai-summary"]),
	content: z.string(),
	aiSummary: z.string().nullable(),
	createdAt: z.string(),
});

const PrescriptionFullSchema = z.object({
	id: z.string(),
	episodeId: z.string(),
	fileId: z.string().nullable(),
	status: z.enum(["draft", "confirmed"]),
	scheduleItems: z.array(ScheduleItemSchema),
	rawAiText: z.string().nullable(),
	sourceNotes: z.string().nullable(),
	createdAt: z.string(),
});

const DoseSchema = z.object({
	id: z.string(),
	episodeId: z.string(),
	itemName: z.string(),
	kind: z.enum(["medication", "meal"]),
	plannedAt: z.string().nullable(),
	actualAt: z.string(),
	status: z.enum(["given", "skipped", "undone"]),
	note: z.string().nullable(),
	adjustmentJson: z.string().nullable(),
	createdAt: z.string(),
});

// Live treatment state per item — surfaced so the UI can show "Day 4 / 7",
// "ends in 2d", or "stopped" without having to recompute from prescription
// templates + dose history.
const ScheduleStateSchema = z.object({
	id: z.string(),
	episodeId: z.string(),
	itemKey: z.string(),
	displayName: z.string(),
	kind: z.enum(["medication", "meal"]),
	dosage: z.string().nullable(),
	route: z.string().nullable(),
	notes: z.string().nullable(),
	intervalHours: z.number(),
	anchorAt: z.string(),
	durationDays: z.number().nullable(),
	prescriptionId: z.string().nullable(),
	active: z.boolean(),
	startsAt: z.string().nullable(),
	endsAt: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const episodeStartTool = (_env: Env) =>
	createTool({
		id: "episode_start",
		description:
			"Start a new care episode (illness, treatment cycle, etc.) for the pet this deployment is for.",
		inputSchema: z.object({
			title: z.string(),
			summary: z.string().optional(),
		}),
		outputSchema: z.object({ episode: EpisodeSchema }),
		_meta: { ui: { resourceUri: URI.episodeStart } },
		execute: async ({ context, runtimeContext }) => {
			const ep = await startEpisode(runtimeContext.env as Env, {
				petId: PET_SELF_ID,
				title: context.title,
				summary: context.summary,
			});
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
			timeZone: z
				.string()
				.optional()
				.describe(
					"IANA tz used to interpret prescription HH:mm as wall-clock time (defaults to UTC). Browser callers should pass Intl.DateTimeFormat().resolvedOptions().timeZone.",
				),
		}),
		outputSchema: z.object({
			episode: EpisodeSchema.nullable(),
			timetable: z.array(TimetableEntrySchema),
			prescriptions: z.array(PrescriptionFullSchema),
			notes: z.array(NoteSchema),
			doses: z.array(DoseSchema),
			scheduleStates: z.array(ScheduleStateSchema),
		}),
		_meta: { ui: { resourceUri: URI.episodeGet } },
		annotations: { readOnlyHint: true },
		execute: async ({ context, runtimeContext }) => {
			const e = runtimeContext.env as Env;
			// All independent reads in one batch — episode, the four lists, and
			// schedule_states up front. getPet is conditional: skip it entirely
			// when the caller already supplied a timezone (every browser call
			// does, since the React client passes Intl.DateTimeFormat().tz). MCP
			// callers that omit it fall back to a pet lookup.
			const [ep, rxRows, doseRows, noteRows, scheduleStatesRaw] =
				await Promise.all([
					getEpisode(e, context.episodeId),
					listPrescriptions(e, context.episodeId),
					listDoses(e, context.episodeId),
					listNotes(e, context.episodeId),
					listScheduleStates(e, context.episodeId),
				]);
			if (!ep)
				return {
					episode: null,
					timetable: [],
					prescriptions: [],
					notes: [],
					doses: [],
					scheduleStates: [],
				};

			let tz = context.timeZone;
			if (!tz) {
				const pet = await getSelfPet(e);
				tz = pet?.timezone ?? "UTC";
			}

			const window = context.windowHours ?? 48;
			// Anchor the window to "midnight today in the pet's tz" so the
			// full current day is always visible (instead of a sliding now-6h).
			const from = startOfDayInZone(new Date(), tz);
			const to = new Date(from.getTime() + window * 60 * 60 * 1000);

			// Lazy-backfill: existing rows + doses are already in hand, so no
			// additional reads inside ensure unless a brand-new item drops in.
			const states = await ensureScheduleStateForEpisode(
				e,
				ep.id,
				rxRows,
				tz,
				{ schedules: scheduleStatesRaw, doses: doseRows },
			);

			const timetable = deriveTimetable({
				scheduleStates: states,
				doses: doseRows,
				from,
				to,
				episodeStartedAt: new Date(ep.startedAt),
				timeZone: tz,
			});

			return {
				episode: ep,
				timetable,
				prescriptions: rxRows.map((r) => ({
					id: r.id,
					episodeId: r.episodeId,
					fileId: r.fileId,
					status: r.status,
					scheduleItems: parseScheduleItems(r),
					rawAiText: r.rawAiText,
					sourceNotes: r.sourceNotes,
					createdAt: r.createdAt,
				})),
				notes: noteRows,
				doses: doseRows,
				scheduleStates: states,
			};
		},
	});

export const episodeListTool = (_env: Env) =>
	createTool({
		id: "episode_list",
		description: "List episodes for the pet this deployment is for.",
		inputSchema: z.object({}),
		outputSchema: z.object({ episodes: z.array(EpisodeSchema) }),
		_meta: { ui: { resourceUri: URI.episodeList } },
		annotations: { readOnlyHint: true },
		execute: async ({ runtimeContext }) => {
			const eps = await listEpisodes(runtimeContext.env as Env, PET_SELF_ID);
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

export const episodeUpdateTool = (_env: Env) =>
	createTool({
		id: "episode_update",
		description:
			"Edit an existing episode in place — title, summary/status text, start date, or status. Useful for correcting an inaccurate startedAt (e.g. the illness actually began before the episode was created in the app), renaming, or reopening a closed episode.\n\nFor the start date, PREFER startedLocal (wall-clock in the pet's timezone). Accepts 'YYYY-MM-DD' (midnight), 'HH:mm' (today), or 'YYYY-MM-DD HH:mm'. Use startedAt only with a full tz-qualified ISO string.",
		inputSchema: z.object({
			episodeId: z.string(),
			title: z.string().optional(),
			summary: z
				.string()
				.nullable()
				.optional()
				.describe(
					"Long-form description / live status. Pass null to clear it.",
				),
			startedAt: z
				.string()
				.optional()
				.describe(
					"Tz-qualified ISO start timestamp. Prefer startedLocal for wall-clock dates.",
				),
			startedLocal: z
				.string()
				.optional()
				.describe(
					"Wall-clock start in the pet's timezone. 'YYYY-MM-DD' (midnight), 'HH:mm' (today), or 'YYYY-MM-DD HH:mm'.",
				),
			status: z
				.enum(["open", "closed"])
				.optional()
				.describe("Reopen or close the episode."),
		}),
		outputSchema: z.object({ episode: EpisodeSchema.nullable() }),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const ep = await getEpisode(env, context.episodeId);
			if (!ep) throw new Error(`Episode not found: ${context.episodeId}`);
			const pet = await getSelfPet(env);
			const tz = pet?.timezone ?? "UTC";

			let startedAt = context.startedAt;
			if (context.startedLocal !== undefined) {
				// Accept date-only "YYYY-MM-DD" by anchoring to midnight in tz.
				const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(context.startedLocal);
				const wallClock = dateOnly
					? `${context.startedLocal} 00:00`
					: context.startedLocal;
				startedAt = wallClockToIso(wallClock, tz);
			}

			const updated = await updateEpisode(env, ep.id, {
				title: context.title,
				summary: context.summary,
				startedAt,
				status: context.status,
				// When reopening, clear endedAt so it doesn't show as closed in lists.
				endedAt: context.status === "open" ? null : undefined,
			});
			return { episode: updated };
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
