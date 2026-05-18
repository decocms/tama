import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { type Dose, doses } from "../db/schema.ts";
import type { Env } from "../env.ts";
import { newId } from "./ids.ts";

export interface LogDoseInput {
	episodeId: string;
	itemName: string;
	kind?: "medication" | "meal";
	plannedAt?: string;
	actualAt?: string;
	status?: "given" | "skipped" | "undone";
	note?: string;
}

export async function logDose(env: Env, input: LogDoseInput): Promise<Dose> {
	const id = newId("dose");
	const [row] = await db(env)
		.insert(doses)
		.values({
			id,
			episodeId: input.episodeId,
			itemName: input.itemName,
			kind: input.kind ?? "medication",
			plannedAt: input.plannedAt,
			actualAt: input.actualAt ?? new Date().toISOString(),
			status: input.status ?? "given",
			note: input.note,
		})
		.returning();
	return row;
}

export async function listDoses(env: Env, episodeId: string): Promise<Dose[]> {
	return db(env)
		.select()
		.from(doses)
		.where(eq(doses.episodeId, episodeId))
		.orderBy(desc(doses.actualAt));
}

export async function getDose(env: Env, id: string): Promise<Dose | null> {
	const rows = await db(env).select().from(doses).where(eq(doses.id, id));
	return rows[0] ?? null;
}

export interface UpdateDoseInput {
	plannedAt?: string | null;
	actualAt?: string;
	status?: "given" | "skipped" | "undone";
	note?: string | null;
}

export async function updateDose(
	env: Env,
	id: string,
	patch: UpdateDoseInput,
): Promise<Dose | null> {
	const writable: Partial<typeof doses.$inferInsert> = {};
	if (patch.plannedAt !== undefined) writable.plannedAt = patch.plannedAt;
	if (patch.actualAt !== undefined) writable.actualAt = patch.actualAt;
	if (patch.status !== undefined) writable.status = patch.status;
	if (patch.note !== undefined) writable.note = patch.note;
	if (Object.keys(writable).length === 0) return getDose(env, id);
	const [row] = await db(env)
		.update(doses)
		.set(writable)
		.where(eq(doses.id, id))
		.returning();
	return row ?? null;
}

// Default ±2h window used when matching doses by time reference.
export const DEFAULT_MATCH_WINDOW_MS = 2 * 60 * 60 * 1000;

export interface PickNearestOpts {
	referenceIso?: string;
	windowMs?: number;
	onlyStatus?: "given" | "skipped";
}

// Pure picker — given a list of doses for an item, find the most relevant one
// for a reference time. Used by dose_update / dose_log undone to locate the
// dose the user means when they don't pass an explicit doseId.
export function pickNearestDose(
	all: Dose[],
	opts: PickNearestOpts = {},
): Dose | null {
	const candidates = opts.onlyStatus
		? all.filter((d) => d.status === opts.onlyStatus)
		: all.filter((d) => d.status !== "undone");
	if (candidates.length === 0) return null;
	if (!opts.referenceIso) {
		return [...candidates].sort((a, b) =>
			a.actualAt < b.actualAt ? 1 : -1,
		)[0];
	}
	const ref = new Date(opts.referenceIso).getTime();
	const window = opts.windowMs ?? DEFAULT_MATCH_WINDOW_MS;
	let best: Dose | null = null;
	let bestDelta = Infinity;
	for (const d of candidates) {
		const times: number[] = [];
		if (d.plannedAt) times.push(new Date(d.plannedAt).getTime());
		times.push(new Date(d.actualAt).getTime());
		for (const t of times) {
			const delta = Math.abs(t - ref);
			if (delta <= window && delta < bestDelta) {
				best = d;
				bestDelta = delta;
			}
		}
	}
	return best;
}

export async function findDoseForItem(
	env: Env,
	episodeId: string,
	itemName: string,
	opts: PickNearestOpts = {},
): Promise<Dose | null> {
	const all = await db(env)
		.select()
		.from(doses)
		.where(and(eq(doses.episodeId, episodeId), eq(doses.itemName, itemName)))
		.orderBy(desc(doses.actualAt));
	return pickNearestDose(all, opts);
}
