import { and, eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
	type Dose,
	type Prescription,
	type ScheduleStateRow,
	scheduleState,
} from "../db/schema.ts";
import type { Env } from "../env.ts";
import type { ScheduleItem } from "../tools/shared.ts";
import { listDoses } from "./doses.ts";
import { newId } from "./ids.ts";
import { parseScheduleItems } from "./prescriptions.ts";
import { wallClockToIso } from "./timetable.ts";

export type ScheduleState = ScheduleStateRow;

export function itemKey(name: string): string {
	return name.trim().toLowerCase();
}

// Compute the interval in hours for a prescription item:
//   1. Honor item.frequencyHours if set.
//   2. Else derive from the number of times in the day (24 / count).
//   3. Cap at 24h minimum sensible (single time = once-daily = 24h).
export function deriveIntervalHours(item: ScheduleItem): number {
	if (item.frequencyHours && item.frequencyHours > 0)
		return item.frequencyHours;
	const n = item.times?.length ?? 0;
	if (n <= 0) return 24;
	return 24 / n;
}

// Compute the initial anchor (next-due) for a brand-new item, in the pet's
// timezone. Uses the FIRST entry in `times` applied to today.
export function deriveInitialAnchor(
	item: ScheduleItem,
	timeZone: string,
): string {
	const firstTime = item.times?.[0];
	if (!firstTime) {
		// No times listed — anchor to now + interval (will appear in the future).
		const fallback = new Date(
			Date.now() + deriveIntervalHours(item) * 60 * 60 * 1000,
		);
		return fallback.toISOString();
	}
	return wallClockToIso(firstTime, timeZone);
}

export async function listScheduleStates(
	env: Env,
	episodeId: string,
): Promise<ScheduleState[]> {
	return db(env)
		.select()
		.from(scheduleState)
		.where(eq(scheduleState.episodeId, episodeId));
}

export async function getScheduleState(
	env: Env,
	episodeId: string,
	key: string,
): Promise<ScheduleState | null> {
	const rows = await db(env)
		.select()
		.from(scheduleState)
		.where(
			and(
				eq(scheduleState.episodeId, episodeId),
				eq(scheduleState.itemKey, key),
			),
		);
	return rows[0] ?? null;
}

export interface UpsertScheduleStateInput {
	episodeId: string;
	item: ScheduleItem;
	prescriptionId: string;
	timeZone: string;
	// Optional: ISO of the latest given/skipped dose for this item. When
	// provided to a brand-new row, the anchor lands on lastDoseAt + interval
	// instead of the prescription's first-time-today — so backfill respects
	// doses logged before schedule_state existed.
	latestDoseAt?: string | null;
}

// Insert if missing, otherwise refresh the *template* fields (display name,
// dosage, route, notes, interval, duration, prescription_id) WITHOUT touching
// the live anchor_at. The anchor only moves when the user gives, snoozes, or
// skips — re-prescribing the same med doesn't reset their drift.
export async function upsertScheduleState(
	env: Env,
	input: UpsertScheduleStateInput,
): Promise<ScheduleState> {
	const key = itemKey(input.item.name);
	const existing = await getScheduleState(env, input.episodeId, key);
	const intervalHours = deriveIntervalHours(input.item);

	if (existing) {
		const [row] = await db(env)
			.update(scheduleState)
			.set({
				displayName: input.item.name,
				kind: input.item.kind,
				dosage: input.item.dosage ?? null,
				route: input.item.route ?? null,
				notes: input.item.notes ?? null,
				intervalHours,
				durationDays: input.item.durationDays ?? null,
				prescriptionId: input.prescriptionId,
				active: true,
				updatedAt: new Date().toISOString(),
			})
			.where(eq(scheduleState.id, existing.id))
			.returning();
		return row;
	}

	// Anchor decision when creating a fresh row:
	//   1. If there's a known last dose for this item, next = last + interval
	//      (the natural cascade — same as advanceAnchorAfterDose).
	//   2. Else, the prescription's first time today in pet's tz.
	const anchorAt = input.latestDoseAt
		? new Date(
				new Date(input.latestDoseAt).getTime() + intervalHours * 60 * 60 * 1000,
			).toISOString()
		: deriveInitialAnchor(input.item, input.timeZone);
	const [row] = await db(env)
		.insert(scheduleState)
		.values({
			id: newId("ss"),
			episodeId: input.episodeId,
			itemKey: key,
			displayName: input.item.name,
			kind: input.item.kind,
			dosage: input.item.dosage,
			route: input.item.route,
			notes: input.item.notes,
			intervalHours,
			anchorAt,
			durationDays: input.item.durationDays,
			prescriptionId: input.prescriptionId,
			active: true,
		})
		.returning();
	return row;
}

// Reconcile a prescription's items with schedule_state for an episode.
// Called when a prescription is created/confirmed/updated.
export async function syncPrescriptionToScheduleState(
	env: Env,
	rx: Prescription,
	timeZone: string,
): Promise<void> {
	if (rx.status !== "confirmed") return;
	const items = parseScheduleItems(rx);
	for (const item of items) {
		await upsertScheduleState(env, {
			episodeId: rx.episodeId,
			item,
			prescriptionId: rx.id,
			timeZone,
		});
	}
}

// Lazy backfill: ensure schedule_state rows exist for every confirmed-rx
// item in an episode. Idempotent — upsert preserves anchors for existing
// rows. For NEW rows, we look up the latest given/skipped dose for that
// item so the anchor lands on `last + interval` instead of restarting from
// the prescription's first-time-of-day (which would mark already-given
// slots as overdue after a deploy).
export async function ensureScheduleStateForEpisode(
	env: Env,
	episodeId: string,
	prescriptions: Prescription[],
	timeZone: string,
): Promise<ScheduleState[]> {
	const existing = await listScheduleStates(env, episodeId);
	const existingKeys = new Set(existing.map((s) => s.itemKey));

	// Pre-compute latest dose per item for backfill purposes only.
	const latestByKey = new Map<string, string>();
	const doses = await listDoses(env, episodeId);
	for (const d of doses) {
		if (d.status === "undone") continue;
		const k = itemKey(d.itemName);
		const prev = latestByKey.get(k);
		if (!prev || new Date(d.actualAt) > new Date(prev)) {
			latestByKey.set(k, d.actualAt);
		}
	}

	const sorted = [...prescriptions].sort(
		(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
	);
	let touched = false;
	for (const rx of sorted) {
		if (rx.status !== "confirmed") continue;
		for (const item of parseScheduleItems(rx)) {
			const key = itemKey(item.name);
			await upsertScheduleState(env, {
				episodeId,
				item,
				prescriptionId: rx.id,
				timeZone,
				latestDoseAt: latestByKey.get(key) ?? null,
			});
			if (!existingKeys.has(key)) touched = true;
		}
	}
	if (!touched && existing.length > 0) return existing;
	return listScheduleStates(env, episodeId);
}

export async function advanceAnchorAfterDose(
	env: Env,
	episodeId: string,
	key: string,
	givenAtIso: string,
): Promise<ScheduleState | null> {
	const row = await getScheduleState(env, episodeId, key);
	if (!row) return null;
	const newAnchor = new Date(
		new Date(givenAtIso).getTime() + row.intervalHours * 60 * 60 * 1000,
	).toISOString();
	const [updated] = await db(env)
		.update(scheduleState)
		.set({ anchorAt: newAnchor, updatedAt: new Date().toISOString() })
		.where(eq(scheduleState.id, row.id))
		.returning();
	return updated ?? null;
}

export async function shiftAnchorBy(
	env: Env,
	episodeId: string,
	key: string,
	hours: number,
): Promise<ScheduleState | null> {
	const row = await getScheduleState(env, episodeId, key);
	if (!row) return null;
	const newAnchor = new Date(
		new Date(row.anchorAt).getTime() + hours * 60 * 60 * 1000,
	).toISOString();
	const [updated] = await db(env)
		.update(scheduleState)
		.set({ anchorAt: newAnchor, updatedAt: new Date().toISOString() })
		.where(eq(scheduleState.id, row.id))
		.returning();
	return updated ?? null;
}

export async function setAnchor(
	env: Env,
	episodeId: string,
	key: string,
	anchorAt: string,
): Promise<ScheduleState | null> {
	const row = await getScheduleState(env, episodeId, key);
	if (!row) return null;
	const [updated] = await db(env)
		.update(scheduleState)
		.set({ anchorAt, updatedAt: new Date().toISOString() })
		.where(eq(scheduleState.id, row.id))
		.returning();
	return updated ?? null;
}

export async function setActive(
	env: Env,
	episodeId: string,
	key: string,
	active: boolean,
): Promise<ScheduleState | null> {
	const row = await getScheduleState(env, episodeId, key);
	if (!row) return null;
	const [updated] = await db(env)
		.update(scheduleState)
		.set({ active, updatedAt: new Date().toISOString() })
		.where(eq(scheduleState.id, row.id))
		.returning();
	return updated ?? null;
}
