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
import { PET_SELF_ID } from "./pet-self.ts";
import { parseScheduleItems } from "./prescriptions.ts";
import { wallClockToIso } from "./timetable.ts";

// Single-pet: every schedule_state row belongs to the one pet (`pet_self`).
// The (pet_id, item_key) pair is unique. Functions take an item key, never a
// scope id.
export type ScheduleState = ScheduleStateRow;

export function itemKey(name: string): string {
	return name.trim().toLowerCase();
}

// Reduce an item name to its "core" for loose matching: lowercase, drop
// parenthetical qualifiers ("(refeição)"), dosage tokens ("3mg/ml", "2ml",
// "1/4 comp"), and collapse punctuation. So "PRELONE 3mg/ml" → "prelone" and
// "PAPA (refeição)" → "papa" — what a bridge agent (or the user) is likely to
// type when logging "gave prelone now".
export function coreItemName(name: string): string {
	return name
		.toLowerCase()
		.replace(/\([^)]*\)/g, " ") // "(refeição)"
		.replace(/\b\d+\s*\/\s*\d+\b/g, " ") // "1/4"
		.replace(
			/\b\d+([.,]\d+)?\s*(mg\/ml|mcg|mg|ml|g|ui|kg|comprimidos?|comp|gotas?|c[aá]psulas?|caps?|doses?)\b/gu,
			" ",
		)
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim()
		.replace(/\s+/g, " ");
}

// Find the single active row that loosely matches `name`. Exact item_key wins;
// otherwise compare normalized cores (equal, or one a word-prefix of the
// other). Returns null when nothing matches OR ≥2 rows match (ambiguous) — so
// the caller can fall back to an ad-hoc dose instead of guessing wrong.
export function matchScheduleByLooseName<
	T extends { displayName: string; itemKey: string; active: boolean },
>(name: string, rows: T[]): T | null {
	const key = itemKey(name);
	const exact = rows.find((r) => r.active && r.itemKey === key);
	if (exact) return exact;
	const g = coreItemName(name);
	if (!g) return null;
	const candidates = rows.filter((r) => {
		if (!r.active) return false;
		const c = coreItemName(r.displayName);
		return !!c && (c === g || c.startsWith(`${g} `) || g.startsWith(`${c} `));
	});
	return candidates.length === 1 ? candidates[0] : null;
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

// Serialize an item's explicit clock times for storage. Explicit times are the
// schedule when present — they win over `frequencyHours` (the timetable pins to
// these exact times, honoring irregular spacing like 07:00/14:00/22:00). Only
// a frequency-only item (no times) falls back to even-interval drift. Returns
// null when there are no valid times.
export function serializeTimes(item: ScheduleItem): string | null {
	const times = (item.times ?? []).filter((t) => /^\d{1,2}:\d{2}$/.test(t));
	return times.length > 0 ? JSON.stringify(times) : null;
}

// Parse the stored clock times for a schedule row. [] when none.
export function parseScheduleTimes(row: {
	timesJson?: string | null;
}): string[] {
	if (!row.timesJson) return [];
	try {
		const v = JSON.parse(row.timesJson);
		return Array.isArray(v) ? v.filter((t) => typeof t === "string") : [];
	} catch {
		return [];
	}
}

// Compute the initial anchor (next-due) for a brand-new item, in the pet's
// timezone. Uses the FIRST entry in `times` applied to today.
export function deriveInitialAnchor(
	item: ScheduleItem,
	timeZone: string,
): string {
	const firstTime = item.times?.[0];
	if (!firstTime) {
		const fallback = new Date(
			Date.now() + deriveIntervalHours(item) * 60 * 60 * 1000,
		);
		return fallback.toISOString();
	}
	return wallClockToIso(firstTime, timeZone);
}

// Lifecycle (start / end / next-due anchor) for an item beginning a FRESH
// course. Used when a brand-new row is inserted AND when a NEW prescription
// re-adopts an existing (possibly expired) row — so re-prescribing a drug whose
// old course ended resets its bounds instead of inheriting the stale endsAt
// (which the auto-expire sweep would immediately deactivate).
export function freshCourseLifecycle(
	item: ScheduleItem,
	intervalHours: number,
	timeZone: string,
): { startsAt: string; endsAt: string | null; anchorAt: string } {
	const nowIso = new Date().toISOString();
	const startsAt = item.startsAt ?? nowIso;
	const anchorAt = item.startsAt
		? new Date(
				new Date(item.startsAt).getTime() + intervalHours * 60 * 60 * 1000,
			).toISOString()
		: deriveInitialAnchor(item, timeZone);
	const endsAt = item.durationDays
		? new Date(
				new Date(startsAt).getTime() + item.durationDays * 24 * 60 * 60 * 1000,
			).toISOString()
		: null;
	return { startsAt, endsAt, anchorAt };
}

export async function listScheduleStates(env: Env): Promise<ScheduleState[]> {
	return db(env)
		.select()
		.from(scheduleState)
		.where(eq(scheduleState.petId, PET_SELF_ID));
}

export async function getScheduleState(
	env: Env,
	key: string,
): Promise<ScheduleState | null> {
	const rows = await db(env)
		.select()
		.from(scheduleState)
		.where(
			and(eq(scheduleState.petId, PET_SELF_ID), eq(scheduleState.itemKey, key)),
		);
	return rows[0] ?? null;
}

// Resolve a loosely-typed item name ("papa", "prelone") to its active schedule
// row ("PAPA (refeição)", "PRELONE 3mg/ml"). Used by dose_log so a dose logged
// via a bridge/agent that doesn't know the exact display_name still clears the
// right scheduled slot instead of landing as an orphan ad-hoc dose.
export async function findScheduleStateByLooseName(
	env: Env,
	name: string,
): Promise<ScheduleState | null> {
	return matchScheduleByLooseName(name, await listScheduleStates(env));
}

export interface UpsertScheduleStateInput {
	item: ScheduleItem;
	prescriptionId: string;
	timeZone: string;
	latestDoseAt?: string | null;
}

// Insert if missing, otherwise refresh the *template* fields WITHOUT touching
// the live anchor_at. The anchor only moves when the user gives, snoozes, or
// skips — re-prescribing the same med doesn't reset their drift.
export async function upsertScheduleState(
	env: Env,
	input: UpsertScheduleStateInput,
): Promise<ScheduleState> {
	const key = itemKey(input.item.name);
	const existing = await getScheduleState(env, key);
	const intervalHours = deriveIntervalHours(input.item);
	const timesJson = serializeTimes(input.item);

	if (existing) {
		// A DIFFERENT prescription now owns this item → it's a fresh course:
		// reset the lifecycle bounds + anchor so an old/expired endsAt doesn't
		// linger (which would auto-expire the reactivated row). Same prescription
		// re-syncing only refreshes the template fields and preserves the live
		// anchor drift + bounds.
		const isNewCourse = existing.prescriptionId !== input.prescriptionId;
		const life = isNewCourse
			? freshCourseLifecycle(input.item, intervalHours, input.timeZone)
			: null;
		const [row] = await db(env)
			.update(scheduleState)
			.set({
				displayName: input.item.name,
				kind: input.item.kind,
				dosage: input.item.dosage ?? null,
				route: input.item.route ?? null,
				notes: input.item.notes ?? null,
				intervalHours,
				timesJson,
				durationDays: input.item.durationDays ?? null,
				prescriptionId: input.prescriptionId,
				active: true,
				updatedAt: new Date().toISOString(),
				...(life
					? {
							startsAt: life.startsAt,
							endsAt: life.endsAt,
							anchorAt: life.anchorAt,
						}
					: {}),
			})
			.where(eq(scheduleState.id, existing.id))
			.returning();
		return row;
	}

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
			petId: PET_SELF_ID,
			itemKey: key,
			displayName: input.item.name,
			kind: input.item.kind,
			dosage: input.item.dosage,
			route: input.item.route,
			notes: input.item.notes,
			intervalHours,
			timesJson,
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

export async function endScheduleStateItem(
	env: Env,
	key: string,
	endsAt?: string,
): Promise<ScheduleState | null> {
	const row = await getScheduleState(env, key);
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

export async function setScheduleStateBounds(
	env: Env,
	key: string,
	bounds: { startsAt?: string | null; endsAt?: string | null },
): Promise<ScheduleState | null> {
	const row = await getScheduleState(env, key);
	if (!row) return null;
	const patch: {
		startsAt?: string | null;
		endsAt?: string | null;
		active?: boolean;
		updatedAt: string;
	} = { updatedAt: new Date().toISOString() };
	if (bounds.startsAt !== undefined) patch.startsAt = bounds.startsAt;
	if (bounds.endsAt !== undefined) {
		patch.endsAt = bounds.endsAt;
		// Derive active from the new end so set_bounds is deterministic: a future
		// (or cleared) end RE-OPENS the item; a past end closes it. This is how
		// you reactivate a treatment whose course was extended.
		patch.active =
			bounds.endsAt == null || new Date(bounds.endsAt).getTime() > Date.now();
	}
	const [updated] = await db(env)
		.update(scheduleState)
		.set(patch)
		.where(eq(scheduleState.id, row.id))
		.returning();
	return updated ?? null;
}

// Reconcile a confirmed prescription's items into schedule_state.
export async function syncPrescriptionToScheduleState(
	env: Env,
	rx: Prescription,
	timeZone: string,
): Promise<void> {
	if (rx.status !== "confirmed") return;
	const items = parseScheduleItems(rx);
	for (const item of items) {
		await upsertScheduleState(env, {
			item,
			prescriptionId: rx.id,
			timeZone,
		});
	}
}

// Resolve each itemKey to its SINGLE owning prescription + item. The same drug
// can sit in several confirmed prescriptions (re-prescribed, or a consolidated
// schedule that supersedes older single-drug ones), and a key can repeat within
// one prescription's items. The newest confirmed prescription wins (sorted
// createdAt-ascending, later overwrites the earlier).
//
// This dedup is load-bearing: ensureScheduleStateForPet writes one row per key.
// Without it, two prescriptions claiming the same key would push concurrent
// UPDATEs to the SAME schedule_state row in one call — a Promise.all race whose
// winner flips times_json/startsAt/anchorAt per request, so the timetable
// flickers between states (overdue appears/disappears) with nobody touching it.
export function resolveScheduleOwners(prescriptions: Prescription[]): {
	owners: Map<string, { item: ScheduleItem; rx: Prescription }>;
	duplicates: Map<string, string[]>;
} {
	const sorted = [...prescriptions].sort(
		(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
	);
	const owners = new Map<string, { item: ScheduleItem; rx: Prescription }>();
	const claimants = new Map<string, string[]>();
	for (const rx of sorted) {
		if (rx.status !== "confirmed") continue;
		for (const item of parseScheduleItems(rx)) {
			const key = itemKey(item.name);
			owners.set(key, { item, rx });
			const list = claimants.get(key) ?? [];
			if (!list.includes(rx.id)) list.push(rx.id);
			claimants.set(key, list);
		}
	}
	const duplicates = new Map(
		[...claimants].filter(([, ids]) => ids.length > 1),
	);
	return { owners, duplicates };
}

// Lazy backfill: ensure schedule_state rows exist for every confirmed-rx item.
// Idempotent — upsert preserves anchors for existing rows. For NEW rows, we
// anchor on `lastDose + interval` so already-given slots aren't marked overdue.
export async function ensureScheduleStateForPet(
	env: Env,
	prescriptions: Prescription[],
	timeZone: string,
	preloaded?: { schedules?: ScheduleState[]; doses?: Dose[] },
): Promise<ScheduleState[]> {
	const existing = preloaded?.schedules ?? (await listScheduleStates(env));
	const existingByKey = new Map<string, ScheduleState>();
	for (const s of existing) existingByKey.set(s.itemKey, s);

	let hasNewItem = false;
	for (const rx of prescriptions) {
		if (rx.status !== "confirmed") continue;
		for (const item of parseScheduleItems(rx)) {
			if (!existingByKey.has(itemKey(item.name))) {
				hasNewItem = true;
				break;
			}
		}
		if (hasNewItem) break;
	}

	const latestByKey = new Map<string, string>();
	if (hasNewItem) {
		const doses = preloaded?.doses ?? (await listDoses(env));
		for (const d of doses) {
			if (d.status === "undone") continue;
			const k = itemKey(d.itemName);
			const prev = latestByKey.get(k);
			if (!prev || new Date(d.actualAt) > new Date(prev)) {
				latestByKey.set(k, d.actualAt);
			}
		}
	}

	// Collapse to ONE owner per itemKey before writing (see resolveScheduleOwners).
	const { owners: ownerByKey, duplicates } =
		resolveScheduleOwners(prescriptions);
	for (const [key, ids] of duplicates) {
		console.warn(
			`timetable: itemKey "${key}" in ${ids.length} confirmed prescriptions [${ids.join(", ")}] — using newest (${ownerByKey.get(key)?.rx.id})`,
		);
	}

	let touched = false;
	const writes: Promise<unknown>[] = [];
	const nowIso = new Date().toISOString();
	for (const { item, rx } of ownerByKey.values()) {
		{
			const key = itemKey(item.name);
			const existingRow = existingByKey.get(key);
			const intervalHours = deriveIntervalHours(item);
			const timesJson = serializeTimes(item);
			if (existingRow) {
				// A new prescription re-adopting this item starts a fresh course —
				// reset its bounds + anchor (so an expired endsAt from a prior
				// course doesn't survive and immediately re-deactivate the row).
				const isNewCourse = existingRow.prescriptionId !== rx.id;
				const life = isNewCourse
					? freshCourseLifecycle(item, intervalHours, timeZone)
					: null;
				const needs =
					existingRow.displayName !== item.name ||
					existingRow.kind !== item.kind ||
					existingRow.dosage !== (item.dosage ?? null) ||
					existingRow.route !== (item.route ?? null) ||
					existingRow.notes !== (item.notes ?? null) ||
					existingRow.intervalHours !== intervalHours ||
					existingRow.timesJson !== timesJson ||
					existingRow.durationDays !== (item.durationDays ?? null) ||
					existingRow.prescriptionId !== rx.id ||
					!existingRow.active;
				if (needs) {
					writes.push(
						db(env)
							.update(scheduleState)
							.set({
								displayName: item.name,
								kind: item.kind,
								dosage: item.dosage ?? null,
								route: item.route ?? null,
								notes: item.notes ?? null,
								intervalHours,
								timesJson,
								durationDays: item.durationDays ?? null,
								prescriptionId: rx.id,
								active: true,
								updatedAt: nowIso,
								...(life
									? {
											startsAt: life.startsAt,
											endsAt: life.endsAt,
											anchorAt: life.anchorAt,
										}
									: {}),
							})
							.where(eq(scheduleState.id, existingRow.id)),
					);
					touched = true;
				}
			} else {
				writes.push(
					upsertScheduleState(env, {
						item,
						prescriptionId: rx.id,
						timeZone,
						latestDoseAt: latestByKey.get(key) ?? null,
					}),
				);
				touched = true;
			}
		}
	}
	if (writes.length > 0) await Promise.all(writes);

	const refreshed =
		touched || existing.length === 0 ? await listScheduleStates(env) : existing;
	const toExpire = refreshed.filter(
		(s) => s.active && s.endsAt && s.endsAt <= nowIso,
	);
	if (toExpire.length > 0) {
		await Promise.all(
			toExpire.map((s) =>
				db(env)
					.update(scheduleState)
					.set({ active: false, updatedAt: nowIso })
					.where(eq(scheduleState.id, s.id)),
			),
		);
		return listScheduleStates(env);
	}
	if (!touched && existing.length > 0) return existing;
	return refreshed;
}

export async function advanceAnchorAfterDose(
	env: Env,
	key: string,
	givenAtIso: string,
): Promise<ScheduleState | null> {
	const row = await getScheduleState(env, key);
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
	key: string,
	hours: number,
): Promise<ScheduleState | null> {
	const row = await getScheduleState(env, key);
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
	key: string,
	anchorAt: string,
): Promise<ScheduleState | null> {
	const row = await getScheduleState(env, key);
	if (!row) return null;
	const [updated] = await db(env)
		.update(scheduleState)
		.set({ anchorAt, updatedAt: new Date().toISOString() })
		.where(eq(scheduleState.id, row.id))
		.returning();
	return updated ?? null;
}

// Hard-delete a single schedule_state row by id (cleanup of orphan/ghost rows).
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
	key: string,
	active: boolean,
): Promise<ScheduleState | null> {
	const row = await getScheduleState(env, key);
	if (!row) return null;
	const [updated] = await db(env)
		.update(scheduleState)
		.set({ active, updatedAt: new Date().toISOString() })
		.where(eq(scheduleState.id, row.id))
		.returning();
	return updated ?? null;
}
