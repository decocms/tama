import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.ts";
import { type Pet, pets } from "../db/schema.ts";
import type { Env } from "../env.ts";
import type { Enrichment } from "../tools/shared.ts";
import { newId } from "./ids.ts";

export interface CreatePetInput {
	name: string;
	species?: string;
	breed?: string;
	dob?: string;
	weightKg?: number;
	ownerNotes?: string;
}

export async function createPet(env: Env, input: CreatePetInput): Promise<Pet> {
	const id = newId("pet");
	const [row] = await db(env)
		.insert(pets)
		.values({
			id,
			name: input.name,
			species: input.species ?? "dog",
			breed: input.breed,
			dob: input.dob,
			weightKg: input.weightKg,
			ownerNotes: input.ownerNotes,
		})
		.returning();
	return row;
}

export async function getPet(env: Env, id: string): Promise<Pet | null> {
	const rows = await db(env)
		.select()
		.from(pets)
		.where(and(eq(pets.id, id), isNull(pets.deletedAt)));
	return rows[0] ?? null;
}

export async function listPets(env: Env): Promise<Pet[]> {
	return db(env)
		.select()
		.from(pets)
		.where(isNull(pets.deletedAt))
		.orderBy(desc(pets.createdAt));
}

export async function setEnrichment(
	env: Env,
	petId: string,
	enrichment: Enrichment,
): Promise<Pet> {
	const [row] = await db(env)
		.update(pets)
		.set({ enrichmentJson: JSON.stringify(enrichment) })
		.where(eq(pets.id, petId))
		.returning();
	return row;
}

export interface UpdatePetInput {
	name?: string;
	species?: string;
	breed?: string | null;
	dob?: string | null;
	weightKg?: number | null;
	ownerNotes?: string | null;
}

export async function updatePet(
	env: Env,
	id: string,
	patch: UpdatePetInput,
): Promise<Pet | null> {
	const writable: Partial<typeof pets.$inferInsert> = {};
	if (patch.name !== undefined) writable.name = patch.name;
	if (patch.species !== undefined) writable.species = patch.species;
	if (patch.breed !== undefined) writable.breed = patch.breed;
	if (patch.dob !== undefined) writable.dob = patch.dob;
	if (patch.weightKg !== undefined) writable.weightKg = patch.weightKg;
	if (patch.ownerNotes !== undefined) writable.ownerNotes = patch.ownerNotes;
	if (Object.keys(writable).length === 0) return getPet(env, id);
	const [row] = await db(env)
		.update(pets)
		.set(writable)
		.where(eq(pets.id, id))
		.returning();
	return row ?? null;
}

export async function deletePet(env: Env, id: string): Promise<boolean> {
	// Soft delete: mark pet and cascade the flag to its episodes so they
	// disappear from listings too. Underlying data is preserved.
	const now = new Date().toISOString();
	const { episodes } = await import("../db/schema.ts");
	const result = await db(env)
		.update(pets)
		.set({ deletedAt: now })
		.where(and(eq(pets.id, id), isNull(pets.deletedAt)))
		.returning();
	if (result.length === 0) return false;
	await db(env)
		.update(episodes)
		.set({ deletedAt: now })
		.where(and(eq(episodes.petId, id), isNull(episodes.deletedAt)));
	return true;
}

export function parseEnrichment(pet: Pet): Enrichment | null {
	if (!pet.enrichmentJson) return null;
	try {
		return JSON.parse(pet.enrichmentJson) as Enrichment;
	} catch {
		return null;
	}
}
