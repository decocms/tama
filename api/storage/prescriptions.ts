import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
	type Prescription,
	prescriptions,
	scheduleState,
} from "../db/schema.ts";
import type { Env } from "../env.ts";
import { type ScheduleItem, ScheduleItemsSchema } from "../tools/shared.ts";
import { newId } from "./ids.ts";

export interface CreatePrescriptionInput {
	episodeId: string;
	fileId?: string;
	scheduleItems: ScheduleItem[];
	rawAiText?: string;
	sourceNotes?: string;
	status?: "draft" | "confirmed";
}

export async function createPrescription(
	env: Env,
	input: CreatePrescriptionInput,
): Promise<Prescription> {
	const id = newId("rx");
	const [row] = await db(env)
		.insert(prescriptions)
		.values({
			id,
			episodeId: input.episodeId,
			fileId: input.fileId,
			scheduleItemsJson: JSON.stringify(input.scheduleItems),
			rawAiText: input.rawAiText,
			sourceNotes: input.sourceNotes,
			status: input.status ?? "draft",
		})
		.returning();
	return row;
}

export async function getPrescription(
	env: Env,
	id: string,
): Promise<Prescription | null> {
	const rows = await db(env)
		.select()
		.from(prescriptions)
		.where(eq(prescriptions.id, id));
	return rows[0] ?? null;
}

export async function listPrescriptions(
	env: Env,
	episodeId: string,
): Promise<Prescription[]> {
	return db(env)
		.select()
		.from(prescriptions)
		.where(eq(prescriptions.episodeId, episodeId))
		.orderBy(desc(prescriptions.createdAt));
}

export interface UpdatePrescriptionInput {
	id: string;
	scheduleItems?: ScheduleItem[];
	status?: "draft" | "confirmed";
	sourceNotes?: string;
}

export async function updatePrescription(
	env: Env,
	input: UpdatePrescriptionInput,
): Promise<Prescription | null> {
	const patch: Partial<typeof prescriptions.$inferInsert> = {};
	if (input.scheduleItems)
		patch.scheduleItemsJson = JSON.stringify(input.scheduleItems);
	if (input.status) patch.status = input.status;
	if (input.sourceNotes !== undefined) patch.sourceNotes = input.sourceNotes;
	if (Object.keys(patch).length === 0) return getPrescription(env, input.id);

	const [row] = await db(env)
		.update(prescriptions)
		.set(patch)
		.where(eq(prescriptions.id, input.id))
		.returning();
	return row ?? null;
}

export function parseScheduleItems(rx: Prescription): ScheduleItem[] {
	try {
		const parsed = JSON.parse(rx.scheduleItemsJson);
		return ScheduleItemsSchema.parse(parsed);
	} catch {
		return [];
	}
}

// Delete a prescription. When deactivateItems=true (default), every
// schedule_state row that pointed at this prescription is marked inactive
// first — otherwise items would orphan with prescription_id=null AND stay
// active=true (because the FK has ON DELETE SET NULL), which is exactly the
// "I deleted the duplicate but the timetable still shows it" trap.
export async function deletePrescription(
	env: Env,
	id: string,
	options: { deactivateItems?: boolean } = {},
): Promise<{ deleted: boolean; deactivatedItems: number }> {
	const deactivate = options.deactivateItems ?? true;
	let deactivatedItems = 0;
	if (deactivate) {
		const rows = await db(env)
			.update(scheduleState)
			.set({ active: false, updatedAt: new Date().toISOString() })
			.where(
				and(
					eq(scheduleState.prescriptionId, id),
					eq(scheduleState.active, true),
				),
			)
			.returning({ id: scheduleState.id });
		deactivatedItems = rows.length;
	}
	const deleted = await db(env)
		.delete(prescriptions)
		.where(eq(prescriptions.id, id))
		.returning({ id: prescriptions.id });
	return { deleted: deleted.length > 0, deactivatedItems };
}
