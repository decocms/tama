import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { type Dose, doses } from "../db/schema.ts";
import type { Env } from "../env.ts";
import type { Adjustment } from "../tools/shared.ts";
import { newId } from "./ids.ts";

export interface LogDoseInput {
	episodeId: string;
	itemName: string;
	kind?: "medication" | "meal";
	plannedAt?: string;
	actualAt?: string;
	status?: "given" | "skipped" | "undone";
	note?: string;
	adjustment?: Adjustment;
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
			adjustmentJson: input.adjustment
				? JSON.stringify(input.adjustment)
				: null,
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

export function parseAdjustment(d: Dose): Adjustment | null {
	if (!d.adjustmentJson) return null;
	try {
		return JSON.parse(d.adjustmentJson) as Adjustment;
	} catch {
		return null;
	}
}
