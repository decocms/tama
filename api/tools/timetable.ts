import { createTool } from "@decocms/runtime/tools";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { scheduleState } from "../db/schema.ts";
import type { Env } from "../env.ts";
import { broadcastDoseLogged } from "../notifications/broadcasts.ts";
import {
	findDoseForItem,
	listDoses,
	logDose,
	updateDose,
} from "../storage/doses.ts";
import { getEpisode } from "../storage/episodes.ts";
import { getSelfPet } from "../storage/pet-self.ts";
import {
	listPrescriptions,
	parseScheduleItems,
} from "../storage/prescriptions.ts";
import {
	deleteScheduleState,
	endScheduleStateItem,
	ensureScheduleStateForEpisode,
	getScheduleState,
	itemKey,
	listScheduleStates,
	setAnchor,
	setScheduleStateBounds,
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
			const pet = await getSelfPet(e);
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

Item matching:
- Scheduled item (recurring on the timetable): pass its existing display_name. Anchor advances.
- One-off / ad-hoc dose ("gave Luftal for gas", not part of any prescription): pass the item name as-is. The dose is recorded normally with the supplied name + kind, but no anchor is advanced (nothing recurring to update). Use this freely for unscheduled meds and meals.

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
			const key = itemKey(context.itemName);

			// Fast path: episode + the canonical schedule_state row in one
			// parallel batch. The schedule_state row carries everything we need
			// (display_name, kind, interval_hours) — no need to round-trip
			// through prescriptions or call ensureScheduleStateForEpisode in
			// the happy path. listPrescriptions / getPet are only fetched on
			// the slow paths below (missing schedule_state, or wall-clock
			// timestamp inputs).
			const [ep, ssRow] = await Promise.all([
				getEpisode(env, context.episodeId),
				getScheduleState(env, context.episodeId, key),
			]);
			if (!ep) throw new Error(`Episode not found: ${context.episodeId}`);

			let canonical: string;
			let canonicalKind: "medication" | "meal";
			let intervalHours: number;
			let petTimezone: string | null = null;

			// intervalHours is null for ad-hoc / one-off doses where we have no
			// schedule_state row to advance. The dose is still recorded normally.
			let intervalHoursOrNull: number | null = null;

			if (ssRow) {
				canonical = ssRow.displayName;
				canonicalKind = ssRow.kind as "medication" | "meal";
				intervalHoursOrNull = ssRow.intervalHours;
			} else {
				// Slow path: no schedule_state row. Could be (a) a stale episode
				// pre-dating the lazy backfill, (b) the LLM passed the item name
				// in a variant that didn't normalize the same way, or (c) a
				// genuine ad-hoc dose the user wants to record ("gave Luftal
				// for gas"). Try to reconcile from confirmed prescriptions
				// first; if still no match, accept it as a one-off log with
				// the user-supplied name + kind and skip anchor advancement.
				const [pet, rxRows] = await Promise.all([
					getSelfPet(env),
					listPrescriptions(env, context.episodeId),
				]);
				petTimezone = pet?.timezone ?? "UTC";
				const knownItems = new Map<
					string,
					{ name: string; kind: "medication" | "meal" }
				>();
				for (const r of rxRows) {
					if (r.status !== "confirmed") continue;
					for (const it of parseScheduleItems(r)) {
						knownItems.set(it.name.toLowerCase(), {
							name: it.name,
							kind: it.kind,
						});
					}
				}
				const found = knownItems.get(context.itemName.toLowerCase());
				if (found) {
					await ensureScheduleStateForEpisode(env, ep.id, rxRows, petTimezone);
					const refreshed = await getScheduleState(env, ep.id, key);
					canonical = found.name;
					canonicalKind = found.kind;
					intervalHoursOrNull = refreshed?.intervalHours ?? null;
				} else {
					// Ad-hoc: log it under the name the user gave, without
					// touching schedule_state. Preserves the dose in history
					// but doesn't put it on the recurring timetable.
					canonical = context.itemName;
					canonicalKind = context.kind ?? "medication";
					intervalHoursOrNull = null;
				}
			}

			// Wall-clock timestamp inputs (plannedLocal / actualLocal) require
			// the pet's timezone. The browser Give-button path never uses these,
			// so most calls skip the pet read entirely.
			let plannedAt = context.plannedAt;
			let actualAt = context.actualAt;
			if (context.plannedLocal || context.actualLocal) {
				if (petTimezone === null) {
					const pet = await getSelfPet(env);
					petTimezone = pet?.timezone ?? "UTC";
				}
				if (context.plannedLocal)
					plannedAt = wallClockToIso(context.plannedLocal, petTimezone);
				if (context.actualLocal)
					actualAt = wallClockToIso(context.actualLocal, petTimezone);
			}

			// Undone path: tombstone the most-recent matching dose, do NOT
			// advance the anchor or broadcast (it's a correction, not a fresh
			// administration).
			if (context.status === "undone") {
				const reference = plannedAt ?? actualAt;
				const match = await findDoseForItem(
					env,
					context.episodeId,
					canonical,
					{ referenceIso: reference },
				);
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

			// Normal given/skipped path: log the dose AND, when we have a
			// schedule_state row to update, advance its anchor — in parallel.
			// Ad-hoc doses (intervalHoursOrNull === null) just log; nothing to
			// advance.
			const actualAtFinal = actualAt ?? new Date().toISOString();
			const nowIso = new Date().toISOString();
			const advancesAnchor =
				(context.status === "given" || context.status === "skipped") &&
				intervalHoursOrNull !== null;
			const newAnchorIso = advancesAnchor
				? new Date(
						new Date(actualAtFinal).getTime() +
							(intervalHoursOrNull as number) * 60 * 60 * 1000,
					).toISOString()
				: null;

			const [dose] = await Promise.all([
				logDose(env, {
					episodeId: context.episodeId,
					itemName: canonical,
					kind: context.kind ?? canonicalKind,
					plannedAt,
					actualAt,
					status: context.status,
					note: context.note,
				}),
				advancesAnchor && newAnchorIso
					? db(env)
							.update(scheduleState)
							.set({ anchorAt: newAnchorIso, updatedAt: nowIso })
							.where(
								and(
									eq(scheduleState.episodeId, context.episodeId),
									eq(scheduleState.itemKey, key),
								),
							)
					: Promise.resolve(),
			]);

			// Broadcast on every given/skipped, including ad-hoc one-offs — the
			// household still wants to know "Luftal given at 14:30". Skipped
			// undone (handled above) doesn't reach here.
			if (context.status === "given" || context.status === "skipped") {
				const broadcastStatus = context.status as "given" | "skipped";
				runtimeContext.ctx.waitUntil(
					broadcastDoseLogged(env, {
						episodeId: ep.id,
						itemName: canonical,
						status: broadcastStatus,
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
			const pet = await getSelfPet(env);
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
			const pet = await getSelfPet(env);
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

export const scheduleStateListTool = (_env: Env) =>
	createTool({
		id: "schedule_state_list",
		description: `List the live treatment state per item for an episode — the canonical view of "what's on the timetable right now". Use this BEFORE prescription_create to see what drugs are already active so you can reuse their exact display_name (or update them via timetable_set_duration / timetable_stop_item) instead of creating a duplicate row with a slightly different name.

Returns one row per (episode, item) tuple. Each row has the canonical display_name, the current anchor (next dose), the live active flag, and the treatment lifecycle bounds (startsAt / endsAt). Items where active=false are recent/historical courses that have been stopped or expired — useful context but they won't appear on the timetable.`,
		inputSchema: z.object({
			episodeId: z.string(),
			includeInactive: z
				.boolean()
				.optional()
				.describe(
					"Default true. When false, only active=true items are returned (the strict timetable view).",
				),
		}),
		outputSchema: z.object({
			scheduleStates: z.array(
				z.object({
					id: z.string(),
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
				}),
			),
		}),
		annotations: { readOnlyHint: true },
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const all = await listScheduleStates(env, context.episodeId);
			const includeInactive = context.includeInactive ?? true;
			const filtered = includeInactive ? all : all.filter((s) => s.active);
			return {
				scheduleStates: filtered.map((s) => ({
					id: s.id,
					itemKey: s.itemKey,
					displayName: s.displayName,
					kind: s.kind,
					dosage: s.dosage,
					route: s.route,
					notes: s.notes,
					intervalHours: s.intervalHours,
					anchorAt: s.anchorAt,
					durationDays: s.durationDays,
					prescriptionId: s.prescriptionId,
					active: s.active,
					startsAt: s.startsAt,
					endsAt: s.endsAt,
				})),
			};
		},
	});

export const scheduleStateDeleteTool = (_env: Env) =>
	createTool({
		id: "schedule_state_delete",
		description: `Hard-delete a single schedule_state row by id. Use ONLY to clean up orphan/ghost items left behind by prescription_delete — those rows go inactive but linger with prescription_id=null (because the FK has ON DELETE SET NULL). Past dose history (the doses table) is NOT touched; only the runtime schedule entry goes away.

For "stop a treatment but keep history visible" use timetable_stop_item instead — this is a destructive cleanup tool, not a normal lifecycle action.`,
		inputSchema: z.object({
			id: z
				.string()
				.describe(
					"The schedule_state row id (ss_xxx). Get it from schedule_state_list.",
				),
		}),
		outputSchema: z.object({
			deleted: z.boolean(),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const deleted = await deleteScheduleState(env, context.id);
			return { deleted };
		},
	});

export const timetableStopItemTool = (_env: Env) =>
	createTool({
		id: "timetable_stop_item",
		description: `Stop a treatment — the medicine/meal no longer appears in the timetable. Used when a finite course is done ("simeticona was 7 days, stop now") or when the vet discontinues it. Sets the item's ends_at to now (or to the provided ISO timestamp) and marks it inactive.

This is reversible via timetable_set_duration if you need to extend the course later. Past doses (the history table) are NOT touched.`,
		inputSchema: z.object({
			episodeId: z.string(),
			itemName: z.string(),
			endsAt: z
				.string()
				.optional()
				.describe(
					"Optional ISO timestamp for when the treatment ends. Defaults to now.",
				),
		}),
		outputSchema: z.object({
			itemKey: z.string(),
			endsAt: z.string().nullable(),
			active: z.boolean(),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const ep = await getEpisode(env, context.episodeId);
			if (!ep) throw new Error(`Episode not found: ${context.episodeId}`);
			const pet = await getSelfPet(env);
			const tz = pet?.timezone ?? "UTC";
			const rxRows = await listPrescriptions(env, context.episodeId);
			await ensureScheduleStateForEpisode(env, ep.id, rxRows, tz);
			const key = itemKey(context.itemName);
			const updated = await endScheduleStateItem(
				env,
				ep.id,
				key,
				context.endsAt,
			);
			if (!updated) {
				throw new Error(
					`No schedule state for "${context.itemName}" — is the item in a confirmed prescription?`,
				);
			}
			return {
				itemKey: updated.itemKey,
				endsAt: updated.endsAt,
				active: updated.active,
			};
		},
	});

export const timetableSetDurationTool = (_env: Env) =>
	createTool({
		id: "timetable_set_duration",
		description: `Adjust the treatment lifecycle bounds (startsAt / endsAt) for a scheduled item without stopping it. Use this to extend a course ("add 3 more days of antibiotic"), re-open a stopped one, or pin explicit start/end dates the vet specified.

Either bound can be set to null to clear it (e.g. make a course open-ended). To stop a treatment immediately, prefer timetable_stop_item.`,
		inputSchema: z.object({
			episodeId: z.string(),
			itemName: z.string(),
			startsAt: z
				.string()
				.nullable()
				.optional()
				.describe("ISO timestamp; null to clear; omit to leave unchanged."),
			endsAt: z
				.string()
				.nullable()
				.optional()
				.describe("ISO timestamp; null to clear; omit to leave unchanged."),
		}),
		outputSchema: z.object({
			itemKey: z.string(),
			startsAt: z.string().nullable(),
			endsAt: z.string().nullable(),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const ep = await getEpisode(env, context.episodeId);
			if (!ep) throw new Error(`Episode not found: ${context.episodeId}`);
			const pet = await getSelfPet(env);
			const tz = pet?.timezone ?? "UTC";
			const rxRows = await listPrescriptions(env, context.episodeId);
			await ensureScheduleStateForEpisode(env, ep.id, rxRows, tz);
			const key = itemKey(context.itemName);
			const updated = await setScheduleStateBounds(env, ep.id, key, {
				startsAt: context.startsAt ?? undefined,
				endsAt: context.endsAt ?? undefined,
			});
			if (!updated) {
				throw new Error(
					`No schedule state for "${context.itemName}" — is the item in a confirmed prescription?`,
				);
			}
			return {
				itemKey: updated.itemKey,
				startsAt: updated.startsAt,
				endsAt: updated.endsAt,
			};
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
			const pet = await getSelfPet(env);
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
