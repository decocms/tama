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
import { getSelfPet, PET_SELF_ID } from "../storage/pet-self.ts";
import {
	listPrescriptions,
	parseScheduleItems,
} from "../storage/prescriptions.ts";
import {
	deleteScheduleState,
	endScheduleStateItem,
	ensureScheduleStateForPet,
	getScheduleState,
	itemKey,
	listScheduleStates,
	parseScheduleTimes,
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
			"Get the derived live timetable (next 48h by default). Shows pending, given, and skipped entries for the pet.",
		inputSchema: z.object({
			windowHours: z.number().optional(),
			timeZone: z
				.string()
				.optional()
				.describe(
					"IANA tz used for the day-boundary anchor (defaults to the pet's stored tz, then UTC).",
				),
		}),
		outputSchema: z.object({ entries: z.array(TimetableEntrySchema) }),
		_meta: { ui: { resourceUri: URI.timetable } },
		annotations: { readOnlyHint: true },
		execute: async ({ context, runtimeContext }) => {
			const e = runtimeContext.env as Env;
			const pet = await getSelfPet(e);
			const tz = pet?.timezone ?? context.timeZone ?? "UTC";

			const window = context.windowHours ?? 48;
			const from = startOfDayInZone(new Date(), tz);
			const to = new Date(from.getTime() + window * 60 * 60 * 1000);

			const [rx, doses] = await Promise.all([
				listPrescriptions(e),
				listDoses(e),
			]);
			const states = await ensureScheduleStateForPet(e, rx, tz);
			const entries = deriveTimetable({
				scheduleStates: states,
				doses,
				from,
				to,
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
- status=given (default): inserts a real dose row AND advances the item's schedule anchor to actualAt + interval. Give late and the next dose moves out too.
- status=skipped: inserts a skipped row AND advances the anchor by one full interval.
- status=undone: tombstones the most recent matching prior dose (case-insensitive itemName, near plannedLocal/plannedAt within ±2h). Does NOT rewind the anchor.

Item matching:
- Scheduled item: pass its existing display_name. Anchor advances.
- One-off / ad-hoc dose ("gave Luftal for gas"): pass the name as-is. Recorded normally, no anchor advanced.

Times: when the user mentions a time WITHOUT a timezone, use plannedLocal/actualLocal in "HH:mm" or "YYYY-MM-DD HH:mm" — resolved to UTC via the pet's timezone.`,
		inputSchema: z.object({
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

			const ssRow = await getScheduleState(env, key);

			let canonical: string;
			let canonicalKind: "medication" | "meal";
			let petTimezone: string | null = null;
			let intervalHoursOrNull: number | null = null;

			if (ssRow) {
				canonical = ssRow.displayName;
				canonicalKind = ssRow.kind as "medication" | "meal";
				intervalHoursOrNull = ssRow.intervalHours;
			} else {
				// Slow path: reconcile from confirmed prescriptions, else accept
				// as an ad-hoc one-off log with the user-supplied name + kind.
				const [pet, rxRows] = await Promise.all([
					getSelfPet(env),
					listPrescriptions(env),
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
					await ensureScheduleStateForPet(env, rxRows, petTimezone);
					const refreshed = await getScheduleState(env, key);
					canonical = found.name;
					canonicalKind = found.kind;
					intervalHoursOrNull = refreshed?.intervalHours ?? null;
				} else {
					canonical = context.itemName;
					canonicalKind = context.kind ?? "medication";
					intervalHoursOrNull = null;
				}
			}

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

			if (context.status === "undone") {
				const reference = plannedAt ?? actualAt;
				const match = await findDoseForItem(env, canonical, {
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
									eq(scheduleState.petId, PET_SELF_ID),
									eq(scheduleState.itemKey, key),
								),
							)
					: Promise.resolve(),
			]);

			if (context.status === "given" || context.status === "skipped") {
				const broadcastStatus = context.status as "given" | "skipped";
				runtimeContext.ctx.waitUntil(
					broadcastDoseLogged(env, {
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
			"Edit an existing dose in place — wrong time, wrong status, add/remove note. Does NOT re-shift the schedule anchor. Address by doseId, or itemName + plannedLocal/plannedAt (locates the matching dose within ±2h).",
		inputSchema: z.object({
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
				const match = await findDoseForItem(env, context.itemName, {
					referenceIso: reference,
				});
				if (!match) {
					throw new Error(
						`No matching dose found for "${context.itemName}"${reference ? ` near ${reference}` : ""}.`,
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

export const timetableRescheduleTool = (_env: Env) =>
	createTool({
		id: "timetable_reschedule",
		description: `Move WHEN the next dose of an item is due. Shifts the schedule anchor — no dose row is created. Two ways to say it (pass exactly one):
- shiftHours: relative nudge. Positive = later, negative = earlier, decimals OK (0.25 = +15min). This is a "snooze".
- nextLocal: an absolute wall-clock time in the pet's timezone — "HH:mm" (today, rolls to tomorrow if already past), "YYYY-MM-DD HH:mm", or "YYYY-MM-DDTHH:mm".

For starting/stopping/extending a whole treatment, use timetable_set_bounds instead.`,
		inputSchema: z.object({
			itemName: z.string(),
			shiftHours: z.coerce
				.number()
				.optional()
				.describe("Relative nudge in hours. Positive = later, negative = earlier."),
			nextLocal: z
				.string()
				.optional()
				.describe(
					"Absolute next-due wall-clock in the pet's tz: 'HH:mm', 'YYYY-MM-DD HH:mm', or 'YYYY-MM-DDTHH:mm'.",
				),
		}),
		outputSchema: z.object({
			itemKey: z.string(),
			newAnchorAt: z.string(),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			if (
				(context.shiftHours == null && !context.nextLocal) ||
				(context.shiftHours != null && context.nextLocal)
			) {
				throw new Error(
					"Pass exactly one of shiftHours (relative) or nextLocal (absolute).",
				);
			}
			const pet = await getSelfPet(env);
			const tz = pet?.timezone ?? "UTC";
			const rxRows = await listPrescriptions(env);
			await ensureScheduleStateForPet(env, rxRows, tz);
			const key = itemKey(context.itemName);

			let updated: Awaited<ReturnType<typeof setAnchor>>;
			if (context.shiftHours != null) {
				updated = await shiftAnchorBy(env, key, context.shiftHours);
			} else {
				let anchorIso = wallClockToIso(context.nextLocal as string, tz);
				const isBareHHmm = /^\d{1,2}:\d{2}$/.test(
					(context.nextLocal as string).trim(),
				);
				if (isBareHHmm && new Date(anchorIso).getTime() <= Date.now()) {
					anchorIso = new Date(
						new Date(anchorIso).getTime() + 24 * 60 * 60 * 1000,
					).toISOString();
				}
				updated = await setAnchor(env, key, anchorIso);
			}
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
		description: `List the live treatment state per item — "what's on the timetable right now". Use BEFORE prescription_create to see active drugs and reuse their exact display_name instead of creating a duplicate. Returns one row per item; active=false items are stopped/expired courses (context, not on the timetable).`,
		inputSchema: z.object({
			includeInactive: z
				.boolean()
				.optional()
				.describe(
					"Default true. When false, only active=true items are returned.",
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
					times: z
						.array(z.string())
						.describe(
							"Explicit daily clock times (HH:mm, pet tz). Non-empty = fixed schedule (irregular spacing OK); empty = even interval.",
						),
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
			const all = await listScheduleStates(env);
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
					times: parseScheduleTimes(s),
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

export const timetableSetBoundsTool = (_env: Env) =>
	createTool({
		id: "timetable_set_bounds",
		description: `Manage a treatment's LIFECYCLE on the timetable — start, stop, extend, re-open, or remove it. (To move just the next dose's time, use timetable_reschedule instead.) Pick one intent:
- stop: true → stop now (ends_at = now, item drops off the timetable; past doses kept). Reversible.
- endsAt / startsAt: set explicit lifecycle bounds (ISO). Extend a course, re-open a stopped one (endsAt: a future date or null), or pin a start. null clears a bound; omit leaves it unchanged.
- remove: true → HARD-DELETE the schedule row (orphan/ghost cleanup left by prescription_delete). Past dose history is NOT touched.`,
		inputSchema: z.object({
			itemName: z.string(),
			stop: z
				.boolean()
				.optional()
				.describe("Stop the treatment now (ends_at = now). Shorthand for endsAt=now."),
			startsAt: z
				.string()
				.nullable()
				.optional()
				.describe("ISO timestamp; null clears; omit leaves unchanged."),
			endsAt: z
				.string()
				.nullable()
				.optional()
				.describe("ISO timestamp; null clears; omit leaves unchanged."),
			remove: z
				.boolean()
				.optional()
				.describe("Hard-delete the schedule row (cleanup). Mutually exclusive with the others."),
		}),
		outputSchema: z.object({
			itemKey: z.string(),
			startsAt: z.string().nullable().optional(),
			endsAt: z.string().nullable().optional(),
			active: z.boolean().optional(),
			removed: z.boolean().optional(),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const pet = await getSelfPet(env);
			const tz = pet?.timezone ?? "UTC";
			const rxRows = await listPrescriptions(env);
			await ensureScheduleStateForPet(env, rxRows, tz);
			const key = itemKey(context.itemName);

			// remove: resolve itemName → row id → hard delete.
			if (context.remove) {
				const row = await getScheduleState(env, key);
				if (!row) {
					throw new Error(`No schedule state for "${context.itemName}".`);
				}
				const deleted = await deleteScheduleState(env, row.id);
				return { itemKey: key, removed: deleted };
			}

			// stop: end_at = now (inactive).
			if (context.stop) {
				const updated = await endScheduleStateItem(
					env,
					key,
					context.endsAt ?? undefined,
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
			}

			// set explicit bounds.
			const updated = await setScheduleStateBounds(env, key, {
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
				active: updated.active,
			};
		},
	});
