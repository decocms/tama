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

	// Anchor decision when creating a fresh row, in priority order:
	//   1. Item-provided startsAt — when set, the next anchor is startsAt +
	//      interval. Used to record "Hemax started on 2026-05-18" without
	//      pinning slots to today.
	//   2. Known last dose for this item (cascade — same as advanceAnchorAfterDose).
	//   3. The prescription's first time today in the pet's tz.
	const startsAt =
		input.item.startsAt ?? input.latestDoseAt ?? new Date().toISOString();
	const anchorAt = input.item.startsAt
		? new Date(
				new Date(input.item.startsAt).getTime() +
					intervalHours * 60 * 60 * 1000,
			).toISOString()
		: input.latestDoseAt
			? new Date(
					new Date(input.latestDoseAt).getTime() +
						intervalHours * 60 * 60 * 1000,
				).toISOString()
			: deriveInitialAnchor(input.item, input.timeZone);
	const endsAt = input.item.durationDays
		? new Date(
				new Date(startsAt).getTime() +
					input.item.durationDays * 24 * 60 * 60 * 1000,
			).toISOString()
		: null;
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
			startsAt,
			endsAt,
		})
		.returning();
	return row;
}

// End a treatment immediately or at a specific time. Sets endsAt and flips
// active=false so the medicine stops appearing in the timetable. Use this
// for "Stop simeticona — its 7 days are up" or any early-termination case.
export async function endScheduleStateItem(
	env: Env,
	episodeId: string,
	key: string,
	endsAt?: string,
): Promise<ScheduleState | null> {
	const row = await getScheduleState(env, episodeId, key);
	if (!row) return null;
	const stopAt = endsAt ?? new Date().toISOString();
	const [updated] = await db(env)
		.update(scheduleState)
		.set({
			endsAt: stopAt,
			active: false,
			updatedAt: new Date().toISOString(),
		})
		.where(eq(scheduleState.id, row.id))
		.returning();
	return updated ?? null;
}

// Adjust treatment bounds without ending the course. Either bound may be
// null to clear it (e.g. remove the end date to make a course open-ended).
export async function setScheduleStateBounds(
	env: Env,
	episodeId: string,
	key: string,
	bounds: { startsAt?: string | null; endsAt?: string | null },
): Promise<ScheduleState | null> {
	const row = await getScheduleState(env, episodeId, key);
	if (!row) return null;
	const patch: { startsAt?: string | null; endsAt?: string | null; updatedAt: string } = {
		updatedAt: new Date().toISOString(),
	};
	if (bounds.startsAt !== undefined) patch.startsAt = bounds.startsAt;
	if (bounds.endsAt !== undefined) patch.endsAt = bounds.endsAt;
	const [updated] = await db(env)
		.update(scheduleState)
		.set(patch)
		.where(eq(scheduleState.id, row.id))
		.returning();
	return updated ?? null;
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

	// Auto-expire: anything whose endsAt has passed gets active=false on the
	// next read. Cheaper to handle here (lazy) than to schedule a separate
	// cleanup cron — every episode_get / timetable_get already calls this.
	const nowIso = new Date().toISOString();
	const refreshed = touched || existing.length === 0
		? await listScheduleStates(env, episodeId)
		: existing;
	const toExpire = refreshed.filter(
		(s) => s.active && s.endsAt && s.endsAt <= nowIso,
	);
	if (toExpire.length > 0) {
		for (const s of toExpire) {
			await db(env)
				.update(scheduleState)
				.set({ active: false, updatedAt: nowIso })
				.where(eq(scheduleState.id, s.id));
		}
		return listScheduleStates(env, episodeId);
	}
	if (!touched && existing.length > 0) return existing;
	return refreshed;
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

// Hard-delete a single schedule_state row by id. Used to clean up
// orphan/ghost items left after a prescription_delete — those rows go
// inactive but linger with prescription_id=null. Past dose history (the
// doses table) is unaffected; only the runtime row goes away.
export async function deleteScheduleState(
	env: Env,
	id: string,
): Promise<boolean> {
	const deleted = await db(env)
		.delete(scheduleState)
		.where(eq(scheduleState.id, id))
		.returning({ id: scheduleState.id });
	return deleted.length > 0;
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
