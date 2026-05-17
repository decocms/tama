import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../env.ts";
import { listDoses, logDose } from "../storage/doses.ts";
import { getEpisode } from "../storage/episodes.ts";
import { listPrescriptions } from "../storage/prescriptions.ts";
import { deriveTimetable } from "../storage/timetable.ts";
import { AdjustmentSchema, TimetableEntrySchema } from "./shared.ts";
import { URI } from "./uris.ts";

export const timetableGetTool = (_env: Env) =>
	createTool({
		id: "timetable_get",
		description:
			"Get the derived live timetable for an episode (next 48h by default). Shows pending, given, skipped, and any adjustments applied.",
		inputSchema: z.object({
			episodeId: z.string(),
			windowHours: z.number().optional(),
		}),
		outputSchema: z.object({
			entries: z.array(TimetableEntrySchema),
		}),
		_meta: { ui: { resourceUri: URI.timetableGet } },
		annotations: { readOnlyHint: true },
		execute: async ({ context, runtimeContext }) => {
			const e = runtimeContext.env as Env;
			const ep = await getEpisode(e, context.episodeId);
			if (!ep) return { entries: [] };
			const window = context.windowHours ?? 48;
			const from = new Date();
			from.setMinutes(0, 0, 0);
			from.setHours(from.getHours() - 6);
			const to = new Date(from.getTime() + window * 60 * 60 * 1000);

			const [rx, doses] = await Promise.all([
				listPrescriptions(e, ep.id),
				listDoses(e, ep.id),
			]);
			const entries = deriveTimetable({
				prescriptions: rx,
				doses,
				from,
				to,
				episodeStartedAt: new Date(ep.startedAt),
			});
			return { entries };
		},
	});

export const doseLogTool = (_env: Env) =>
	createTool({
		id: "dose_log",
		description:
			"Log that a medication or meal was given (or skipped). If actualAt differs from plannedAt by more than ~30 minutes, include an adjustment to shift the next dose of the same item to preserve the dosing interval.",
		inputSchema: z.object({
			episodeId: z.string(),
			itemName: z.string(),
			kind: z.enum(["medication", "meal"]).default("medication"),
			plannedAt: z
				.string()
				.optional()
				.describe("ISO timestamp of the originally scheduled time"),
			actualAt: z
				.string()
				.optional()
				.describe("ISO timestamp; defaults to now"),
			status: z.enum(["given", "skipped", "undone"]).default("given"),
			note: z.string().optional(),
			adjustment: AdjustmentSchema.optional().describe(
				"If set, shifts the next pending entry of the same item",
			),
		}),
		outputSchema: z.object({ doseId: z.string() }),
		execute: async ({ context, runtimeContext }) => {
			const dose = await logDose(runtimeContext.env as Env, {
				episodeId: context.episodeId,
				itemName: context.itemName,
				kind: context.kind,
				plannedAt: context.plannedAt,
				actualAt: context.actualAt,
				status: context.status,
				note: context.note,
				adjustment: context.adjustment,
			});
			return { doseId: dose.id };
		},
	});

export const timetableAdjustTool = (_env: Env) =>
	createTool({
		id: "timetable_adjust",
		description:
			"Shift the next not-yet-given entry of an item by N hours. Useful to nudge the schedule without logging a dose.",
		inputSchema: z.object({
			episodeId: z.string(),
			itemName: z.string(),
			hours: z.number().describe("Positive = later, negative = earlier"),
		}),
		outputSchema: z.object({ doseId: z.string() }),
		execute: async ({ context, runtimeContext }) => {
			// Implemented as a "skipped" sentinel dose carrying the adjustment, with status=undone
			// so it doesn't appear as a real dose but the adjustment is still applied. The
			// timetable derivation reads adjustments only from doses with status="given"; to
			// avoid surprising semantics, we instead record a "given" dose with note=adjust-only.
			// For MVP, simplest is: insert a given dose with itemName+plannedAt=now-1m so it
			// doesn't mistakenly match an upcoming slot — but adjustments only fire from given.
			// To keep behavior obvious: persist an adjustment-only "given" dose with an explicit
			// note; the user can see it in the dose log.
			const dose = await logDose(runtimeContext.env as Env, {
				episodeId: context.episodeId,
				itemName: context.itemName,
				status: "given",
				note: "schedule adjustment only",
				adjustment: { kind: "shift-next-by-h", hours: context.hours },
			});
			return { doseId: dose.id };
		},
	});
