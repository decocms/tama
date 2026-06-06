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
	timezone?: string;
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
			timezone: input.timezone,
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

// Store the procedural SVG sprite pack (the cheap/crisp alternative to the
// raster img2img pack). Both can coexist; the companion prefers SVG.
export async function setSvgPack(
	env: Env,
	petId: string,
	pack: Record<string, string>,
	characterJson: string,
): Promise<Pet | null> {
	const [row] = await db(env)
		.update(pets)
		.set({ svgPackJson: JSON.stringify(pack), characterJson })
		.where(eq(pets.id, petId))
		.returning();
	return row ?? null;
}

// The single evolving status summary (replaces the old per-episode
// currentStatus). Regenerated from the whole timeline by pet_summary_refresh.
export async function setPetSummary(
	env: Env,
	petId: string,
	summary: string | null,
): Promise<Pet | null> {
	const [row] = await db(env)
		.update(pets)
		.set({
			summary,
			summaryAt: summary ? new Date().toISOString() : null,
		})
		.where(eq(pets.id, petId))
		.returning();
	return row ?? null;
}

export interface UpdatePetInput {
	name?: string;
	species?: string;
	breed?: string | null;
	dob?: string | null;
	weightKg?: number | null;
	ownerNotes?: string | null;
	timezone?: string | null;
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
	if (patch.timezone !== undefined) writable.timezone = patch.timezone;
	if (Object.keys(writable).length === 0) return getPet(env, id);
	const [row] = await db(env)
		.update(pets)
		.set(writable)
		.where(eq(pets.id, id))
		.returning();
	return row ?? null;
}

export function parseEnrichment(pet: Pet): Enrichment | null {
	if (!pet.enrichmentJson) return null;
	try {
		return JSON.parse(pet.enrichmentJson) as Enrichment;
	} catch {
		return null;
	}
}

export interface SpritePack {
	idle: string;
	happy: string;
	hungry: string;
	"pill-time": string;
	sad: string;
	sleeping: string;
	// Cell size in CSS pixels (companion view scales 4x).
	size?: number;
}

export function parseSpritePack(pet: Pet): SpritePack | null {
	if (!pet.spritePackJson) return null;
	try {
		const obj = JSON.parse(pet.spritePackJson);
		if (
			typeof obj?.idle === "string" &&
			typeof obj?.happy === "string" &&
			typeof obj?.hungry === "string"
		) {
			return obj as SpritePack;
		}
		return null;
	} catch {
		return null;
	}
}

// Structured case-file profile (JSON). See ai/pet-context.ts.
// biome-ignore lint/suspicious/noExplicitAny: shape validated by PetProfileSchema at the edges
export function parseProfile(pet: Pet): any | null {
	if (!pet.profileJson) return null;
	try {
		return JSON.parse(pet.profileJson);
	} catch {
		return null;
	}
}

export async function setProfile(
	env: Env,
	petId: string,
	profile: unknown,
): Promise<Pet | null> {
	const [row] = await db(env)
		.update(pets)
		.set({ profileJson: JSON.stringify(profile) })
		.where(eq(pets.id, petId))
		.returning();
	return row ?? null;
}

// The procedural SVG sprite pack — {state: svgString}. The sole sprite path.
export function parseSvgPack(pet: Pet): Record<string, string> | null {
	if (!pet.svgPackJson) return null;
	try {
		const obj = JSON.parse(pet.svgPackJson);
		if (obj && typeof obj.idle === "string") return obj as Record<string, string>;
		return null;
	} catch {
		return null;
	}
}

export async function setSpritePack(
	env: Env,
	petId: string,
	pack: SpritePack,
	characterJson: string,
	photoFileId: string,
): Promise<Pet | null> {
	const [row] = await db(env)
		.update(pets)
		.set({
			spritePackJson: JSON.stringify(pack),
			characterJson,
			photoFileId,
		})
		.where(eq(pets.id, petId))
		.returning();
	return row ?? null;
}
