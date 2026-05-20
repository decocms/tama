import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../env.ts";
import { broadcastDoseLogged } from "../notifications/broadcasts.ts";
import {
	findDoseForItem,
	listDoses,
	logDose,
	updateDose,
} from "../storage/doses.ts";
import { getEpisode } from "../storage/episodes.ts";
import { getPet } from "../storage/pets.ts";
import {
	listPrescriptions,
	parseScheduleItems,
} from "../storage/prescriptions.ts";
import {
	advanceAnchorAfterDose,
	ensureScheduleStateForEpisode,
	itemKey,
	setAnchor,
	shiftAnchorBy,
} from "../storage/schedule-state.ts";
import {
	deriveTimetable,
	startOfDayInZone,
	wallClockToIso,
} from "../storage/timetable.ts";
import { TimetableEntrySchema } from "./shared.ts";
import { URI } from "./uris.ts";

export const timetableGetTool = (_env: Env) =>
	createTool({
		id: "timetable_get",
		description:
			"Get the derived live timetable for an episode (next 48h by default). Shows pending, given, and skipped entries.",
		inputSchema: z.object({
			episodeId: z.string(),
			windowHours: z.number().optional(),
			timeZone: z
				.string()
				.optional()
				.describe(
					"IANA tz used for the day-boundary anchor (defaults to UTC). Used for the window start, not the prescription times — those live in schedule_state once initialized.",
				),
		}),
		outputSchema: z.object({ entries: z.array(TimetableEntrySchema) }),
		_meta: { ui: { resourceUri: URI.timetableGet } },
		annotations: { readOnlyHint: true },
		execute: async ({ context, runtimeContext }) => {
			const e = runtimeContext.env as Env;
			const ep = await getEpisode(e, context.episodeId);
			if (!ep) return { entries: [] };
			const pet = await getPet(e, ep.petId);
			const tz = pet?.timezone ?? context.timeZone ?? "UTC";

			const window = context.windowHours ?? 48;
			const from = startOfDayInZone(new Date(), tz);
			const to = new Date(from.getTime() + window * 60 * 60 * 1000);

			const [rx, doses] = await Promise.all([
				listPrescriptions(e, ep.id),
				listDoses(e, ep.id),
			]);
			const states = await ensureScheduleStateForEpisode(e, ep.id, rx, tz);
			const entries = deriveTimetable({
				scheduleStates: states,
				doses,
				from,
				to,
				episodeStartedAt: new Date(ep.startedAt),
				timeZone: tz,
			});
			return { entries };
		},
	});

export const doseLogTool = (_env: Env) =>
	createTool({
		id: "dose_log",
		description: `Record that a medication or meal was given, skipped, or undo the most recent matching dose.

Behavior:
- status=given (default): inserts a real dose row AND advances the item's schedule anchor to actualAt + interval. The next slot cascades naturally — give late and the next dose moves out too.
- status=skipped: inserts a skipped row AND advances the anchor by one full interval (jump over the missed slot).
- status=undone: tombstones the most recent matching prior dose (case-insensitive itemName, near plannedLocal/plannedAt within ±2h). Does NOT rewind the anchor — use timetable_snooze or dose_update if you need the schedule to move back.

Item validation: itemName MUST match an item in a confirmed prescription for this episode.
Times: when the user mentions a time WITHOUT a timezone, use plannedLocal/actualLocal in "HH:mm" or "YYYY-MM-DD HH:mm" — the server resolves to UTC via the pet's timezone.

For correcting a previously-logged dose's time, use dose_update. For postponing a future dose without recording an administration, use timetable_snooze.`,
		inputSchema: z.object({
			episodeId: z.string(),
			itemName: z.string(),
			kind: z.enum(["medication", "meal"]).default("medication"),
			plannedAt: z.string().optional(),
			plannedLocal: z.string().optional(),
			actualAt: z.string().optional(),
			actualLocal: z.string().optional(),
			status: z.enum(["given", "skipped", "undone"]).default("given"),
			note: z.string().optional(),
		}),
		outputSchema: z.object({
			doseId: z.string(),
			action: z.enum(["inserted", "undone"]),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;

			const ep = await getEpisode(env, context.episodeId);
			if (!ep) throw new Error(`Episode not found: ${context.episodeId}`);
			const pet = await getPet(env, ep.petId);
			const tz = pet?.timezone ?? "UTC";

			const rxRows = await listPrescriptions(env, context.episodeId);
			const knownItems = new Map<string, string>();
			for (const r of rxRows) {
				if (r.status !== "confirmed") continue;
				for (const it of parseScheduleItems(r)) {
					knownItems.set(it.name.toLowerCase(), it.name);
				}
			}
			const canonical = knownItems.get(context.itemName.toLowerCase());
			if (!canonical) {
				const known = Array.from(knownItems.values()).join(", ") || "(none)";
				throw new Error(
					`Unknown item "${context.itemName}" — not in any confirmed prescription for this episode. Known items: ${known}.`,
				);
			}

			// Make sure schedule_state exists so we can advance the anchor.
			await ensureScheduleStateForEpisode(env, ep.id, rxRows, tz);
			const key = itemKey(canonical);

			const plannedAt = context.plannedLocal
				? wallClockToIso(context.plannedLocal, tz)
				: context.plannedAt;
			const actualAt = context.actualLocal
				? wallClockToIso(context.actualLocal, tz)
				: context.actualAt;

			if (context.status === "undone") {
				const reference = plannedAt ?? actualAt;
				const match = await findDoseForItem(env, context.episodeId, canonical, {
					referenceIso: reference,
				});
				if (match) {
					const updated = await updateDose(env, match.id, {
						status: "undone",
						note: context.note ?? match.note ?? "undone via dose_log",
					});
					return {
						doseId: updated?.id ?? match.id,
						action: "undone" as const,
					};
				}
			}

			const dose = await logDose(env, {
				episodeId: context.episodeId,
				itemName: canonical,
				kind: context.kind,
				plannedAt,
				actualAt,
				status: context.status,
				note: context.note,
			});

			// Advance the anchor on real administrations. The cascade is what
			// the user expects: give at 18:13, next dose is 18:13 + interval,
			// not the original 00:00 slot.
			if (context.status === "given" || context.status === "skipped") {
				await advanceAnchorAfterDose(env, ep.id, key, dose.actualAt);
				// Broadcast to every subscribed device in the BACKGROUND. We use
				// ctx.waitUntil so the tool returns the instant the DB write is
				// committed (~50–150ms) instead of blocking 1–3s on push services
				// — the household sees the dose recorded with no perceptible lag,
				// and the notifications still arrive within a second or two.
				runtimeContext.ctx.waitUntil(
					broadcastDoseLogged(env, {
						episodeId: ep.id,
						itemName: canonical,
						status: context.status,
						actualAt: dose.actualAt,
						note: context.note ?? null,
					}),
				);
			}

			return { doseId: dose.id, action: "inserted" as const };
		},
	});

export const doseUpdateTool = (_env: Env) =>
	createTool({
		id: "dose_update",
		description:
			"Edit an existing dose in place — wrong time, wrong status, add/remove note. Does NOT re-shift the schedule anchor (use timetable_snooze for that). Address by doseId, or itemName + plannedLocal/plannedAt (locates the matching dose within ±2h).",
		inputSchema: z.object({
			episodeId: z.string(),
			doseId: z.string().optional(),
			itemName: z.string().optional(),
			plannedAt: z.string().optional(),
			plannedLocal: z.string().optional(),
			newActualAt: z.string().optional(),
			newActualLocal: z.string().optional(),
			newPlannedAt: z.string().optional().nullable(),
			newPlannedLocal: z.string().optional(),
			newStatus: z.enum(["given", "skipped", "undone"]).optional(),
			newNote: z.string().optional().nullable(),
		}),
		outputSchema: z.object({
			doseId: z.string(),
			updated: z.boolean(),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const ep = await getEpisode(env, context.episodeId);
			if (!ep) throw new Error(`Episode not found: ${context.episodeId}`);
			const pet = await getPet(env, ep.petId);
			const tz = pet?.timezone ?? "UTC";

			let targetId = context.doseId;
			if (!targetId) {
				if (!context.itemName) {
					throw new Error(
						"dose_update requires either doseId, or itemName + a time hint (plannedLocal / plannedAt).",
					);
				}
				const reference = context.plannedLocal
					? wallClockToIso(context.plannedLocal, tz)
					: context.plannedAt;
				const match = await findDoseForItem(
					env,
					context.episodeId,
					context.itemName,
					{ referenceIso: reference },
				);
				if (!match) {
					throw new Error(
						`No matching dose found for "${context.itemName}"${reference ? ` near ${reference}` : ""} in this episode.`,
					);
				}
				targetId = match.id;
			}

			const patch: Parameters<typeof updateDose>[2] = {};
			if (context.newActualLocal !== undefined) {
				patch.actualAt = wallClockToIso(context.newActualLocal, tz);
			} else if (context.newActualAt !== undefined) {
				patch.actualAt = context.newActualAt;
			}
			if (context.newPlannedLocal !== undefined) {
				patch.plannedAt = wallClockToIso(context.newPlannedLocal, tz);
			} else if (context.newPlannedAt !== undefined) {
				patch.plannedAt = context.newPlannedAt;
			}
			if (context.newStatus !== undefined) patch.status = context.newStatus;
			if (context.newNote !== undefined) patch.note = context.newNote;

			if (Object.keys(patch).length === 0) {
				return { doseId: targetId, updated: false };
			}

			const updated = await updateDose(env, targetId, patch);
			return { doseId: updated?.id ?? targetId, updated: !!updated };
		},
	});

export const timetableSnoozeTool = (_env: Env) =>
	createTool({
		id: "timetable_snooze",
		description:
			"Postpone (or pull earlier) the next dose of an item by N hours. Shifts the schedule anchor — no dose row is created. Positive hours = later, negative = earlier. Decimals OK (e.g. 0.25 = +15min, -1.5 = pull 90min earlier). The shift cascades: every future dose of this item moves by the same amount until the next real dose log resets the anchor. For setting an absolute time (e.g. \"next PAPA at 14:00\"), prefer timetable_set_anchor.",
		inputSchema: z.object({
			episodeId: z.string(),
			itemName: z.string(),
			// coerce so LLMs that JSON-serialize numbers as strings ("-1") still
			// work. The string→number cast is straightforward; only non-numeric
			// input fails validation.
			hours: z.coerce
				.number()
				.describe("Positive = later, negative = earlier. e.g. 0.25 = +15min."),
		}),
		outputSchema: z.object({
			itemKey: z.string(),
			newAnchorAt: z.string(),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const ep = await getEpisode(env, context.episodeId);
			if (!ep) throw new Error(`Episode not found: ${context.episodeId}`);
			const pet = await getPet(env, ep.petId);
			const tz = pet?.timezone ?? "UTC";

			const rxRows = await listPrescriptions(env, context.episodeId);
			await ensureScheduleStateForEpisode(env, ep.id, rxRows, tz);
			const key = itemKey(context.itemName);
			const updated = await shiftAnchorBy(env, ep.id, key, context.hours);
			if (!updated) {
				throw new Error(
					`No schedule state for "${context.itemName}" — is the item in a confirmed prescription?`,
				);
			}
			return { itemKey: updated.itemKey, newAnchorAt: updated.anchorAt };
		},
	});

export const timetableSetAnchorTool = (_env: Env) =>
	createTool({
		id: "timetable_set_anchor",
		description: `Set the next-due time of an item to a specific wall-clock time (uses the pet's timezone). Skips the "calculate hours offset" math you'd otherwise need with timetable_snooze.

Accepted formats for nextLocal:
  • "HH:mm"                — today at that time, in the pet's tz (rolls to tomorrow if already past now)
  • "YYYY-MM-DD HH:mm"     — exact date + time, in the pet's tz
  • "YYYY-MM-DDTHH:mm"     — same, ISO separator

Example: itemName="PAPA", nextLocal="14:00" → next PAPA at 14:00 in São Paulo time today (or tomorrow if it's already past 14:00).`,
		inputSchema: z.object({
			episodeId: z.string(),
			itemName: z.string(),
			nextLocal: z
				.string()
				.describe(
					"Wall-clock time in pet's timezone: 'HH:mm', 'YYYY-MM-DD HH:mm', or ISO-ish 'YYYY-MM-DDTHH:mm'.",
				),
		}),
		outputSchema: z.object({
			itemKey: z.string(),
			newAnchorAt: z.string(),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const ep = await getEpisode(env, context.episodeId);
			if (!ep) throw new Error(`Episode not found: ${context.episodeId}`);
			const pet = await getPet(env, ep.petId);
			const tz = pet?.timezone ?? "UTC";

			const rxRows = await listPrescriptions(env, context.episodeId);
			await ensureScheduleStateForEpisode(env, ep.id, rxRows, tz);
			const key = itemKey(context.itemName);

			// Resolve the wall-clock string in the pet's tz. If it's a bare
			// "HH:mm" that's already past in that tz, roll forward by 24h so
			// the user gets the natural "next 14:00" semantics.
			let anchorIso = wallClockToIso(context.nextLocal, tz);
			const isBareHHmm = /^\d{1,2}:\d{2}$/.test(context.nextLocal.trim());
			if (isBareHHmm && new Date(anchorIso).getTime() <= Date.now()) {
				anchorIso = new Date(
					new Date(anchorIso).getTime() + 24 * 60 * 60 * 1000,
				).toISOString();
			}

			const updated = await setAnchor(env, ep.id, key, anchorIso);
			if (!updated) {
				throw new Error(
					`No schedule state for "${context.itemName}" — is the item in a confirmed prescription?`,
				);
			}
			return { itemKey: updated.itemKey, newAnchorAt: updated.anchorAt };
		},
	});
