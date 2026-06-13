import { asc, desc, eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { type VetTeamMember, vetTeam } from "../db/schema.ts";
import type { Env } from "../env.ts";
import { newId } from "./ids.ts";
import { PET_SELF_ID } from "./pet-self.ts";

export interface AddVetTeamInput {
	name: string;
	role?: string | null;
	clinic?: string | null;
	phone?: string | null;
	email?: string | null;
	notes?: string | null;
	active?: boolean;
}

export async function addVetTeamMember(
	env: Env,
	input: AddVetTeamInput,
): Promise<VetTeamMember> {
	const id = newId("vet");
	const [row] = await db(env)
		.insert(vetTeam)
		.values({
			id,
			petId: PET_SELF_ID,
			name: input.name,
			role: input.role ?? null,
			clinic: input.clinic ?? null,
			phone: input.phone ?? null,
			email: input.email ?? null,
			notes: input.notes ?? null,
			active: input.active ?? true,
		})
		.returning();
	return row;
}

// Active members first, then in the order they were added — a stable roster.
export async function listVetTeam(env: Env): Promise<VetTeamMember[]> {
	return db(env)
		.select()
		.from(vetTeam)
		.where(eq(vetTeam.petId, PET_SELF_ID))
		.orderBy(desc(vetTeam.active), asc(vetTeam.createdAt));
}

export interface UpdateVetTeamInput {
	name?: string;
	role?: string | null;
	clinic?: string | null;
	phone?: string | null;
	email?: string | null;
	notes?: string | null;
	active?: boolean;
}

export async function updateVetTeamMember(
	env: Env,
	id: string,
	patch: UpdateVetTeamInput,
): Promise<VetTeamMember | null> {
	// Only touch the fields actually provided; always bump updatedAt.
	const values: Record<string, unknown> = {
		updatedAt: new Date().toISOString(),
	};
	for (const k of [
		"name",
		"role",
		"clinic",
		"phone",
		"email",
		"notes",
		"active",
	] as const) {
		if (patch[k] !== undefined) values[k] = patch[k];
	}
	const [row] = await db(env)
		.update(vetTeam)
		.set(values)
		.where(eq(vetTeam.id, id))
		.returning();
	return row ?? null;
}

export async function deleteVetTeamMember(
	env: Env,
	id: string,
): Promise<boolean> {
	const out = await db(env)
		.delete(vetTeam)
		.where(eq(vetTeam.id, id))
		.returning({ id: vetTeam.id });
	return out.length > 0;
}
