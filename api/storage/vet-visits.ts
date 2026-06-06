import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { type VetVisit, vetVisits } from "../db/schema.ts";
import type { Env } from "../env.ts";
import { newId } from "./ids.ts";
import { PET_SELF_ID } from "./pet-self.ts";

export interface AddVetVisitInput {
	visitedAt?: string;
	vetName?: string | null;
	clinic?: string | null;
	reason?: string | null;
	notes?: string | null;
	fileId?: string | null;
}

export async function addVetVisit(
	env: Env,
	input: AddVetVisitInput,
): Promise<VetVisit> {
	const id = newId("visit");
	const [row] = await db(env)
		.insert(vetVisits)
		.values({
			id,
			petId: PET_SELF_ID,
			visitedAt: input.visitedAt ?? new Date().toISOString(),
			vetName: input.vetName ?? null,
			clinic: input.clinic ?? null,
			reason: input.reason ?? null,
			notes: input.notes ?? null,
			fileId: input.fileId ?? null,
		})
		.returning();
	return row;
}

export async function listVetVisits(env: Env): Promise<VetVisit[]> {
	return db(env)
		.select()
		.from(vetVisits)
		.where(eq(vetVisits.petId, PET_SELF_ID))
		.orderBy(desc(vetVisits.visitedAt));
}

export async function deleteVetVisit(env: Env, id: string): Promise<boolean> {
	const out = await db(env)
		.delete(vetVisits)
		.where(eq(vetVisits.id, id))
		.returning({ id: vetVisits.id });
	return out.length > 0;
}
