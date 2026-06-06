import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { type Vaccine, vaccines } from "../db/schema.ts";
import type { Env } from "../env.ts";
import { newId } from "./ids.ts";
import { PET_SELF_ID } from "./pet-self.ts";

export interface AddVaccineInput {
	name: string;
	administeredAt?: string;
	dueAt?: string | null;
	lot?: string | null;
	vetName?: string | null;
	fileId?: string | null;
}

export async function addVaccine(
	env: Env,
	input: AddVaccineInput,
): Promise<Vaccine> {
	const id = newId("vax");
	const [row] = await db(env)
		.insert(vaccines)
		.values({
			id,
			petId: PET_SELF_ID,
			name: input.name,
			administeredAt: input.administeredAt ?? new Date().toISOString(),
			dueAt: input.dueAt ?? null,
			lot: input.lot ?? null,
			vetName: input.vetName ?? null,
			fileId: input.fileId ?? null,
		})
		.returning();
	return row;
}

export async function listVaccines(env: Env): Promise<Vaccine[]> {
	return db(env)
		.select()
		.from(vaccines)
		.where(eq(vaccines.petId, PET_SELF_ID))
		.orderBy(desc(vaccines.administeredAt));
}

export async function deleteVaccine(env: Env, id: string): Promise<boolean> {
	const out = await db(env)
		.delete(vaccines)
		.where(eq(vaccines.id, id))
		.returning({ id: vaccines.id });
	return out.length > 0;
}
