import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { enrichPet } from "../ai/enrich-pet.ts";
import type { Env } from "../env.ts";
import {
	createPet,
	deletePet,
	getPet,
	listPets,
	parseEnrichment,
	setEnrichment,
	updatePet,
} from "../storage/pets.ts";
import { EnrichmentSchema } from "./shared.ts";
import { URI } from "./uris.ts";

const PetSchema = z.object({
	id: z.string(),
	name: z.string(),
	species: z.string(),
	breed: z.string().nullable(),
	dob: z.string().nullable(),
	weightKg: z.number().nullable(),
	ownerNotes: z.string().nullable(),
	timezone: z.string().nullable(),
	enrichment: EnrichmentSchema.nullable(),
	createdAt: z.string(),
});

function toPet(p: NonNullable<Awaited<ReturnType<typeof getPet>>>) {
	return {
		id: p.id,
		name: p.name,
		species: p.species,
		breed: p.breed,
		dob: p.dob,
		weightKg: p.weightKg,
		ownerNotes: p.ownerNotes,
		timezone: p.timezone,
		enrichment: parseEnrichment(p),
		createdAt: p.createdAt,
	};
}

function toPetOrNull(p: Awaited<ReturnType<typeof getPet>>) {
	return p ? toPet(p) : null;
}

export const petCreateTool = (_env: Env) =>
	createTool({
		id: "pet_create",
		description: "Create a pet profile.",
		inputSchema: z.object({
			name: z.string(),
			species: z.string().optional().describe("Defaults to 'dog'."),
			breed: z.string().optional(),
			dob: z
				.string()
				.optional()
				.describe("ISO date or free-text age description"),
			weightKg: z.number().optional(),
			ownerNotes: z
				.string()
				.optional()
				.describe("Notable conditions, allergies, behaviors"),
			timezone: z
				.string()
				.optional()
				.describe(
					"IANA tz used to interpret prescription HH:mm (e.g. 'America/Sao_Paulo'). Defaults to the dashboard browser tz on creation.",
				),
		}),
		outputSchema: z.object({ pet: PetSchema }),
		_meta: { ui: { resourceUri: URI.petCreate } },
		annotations: { destructiveHint: false, openWorldHint: false },
		execute: async ({ context, runtimeContext }) => {
			const pet = await createPet(runtimeContext.env as Env, context);
			return { pet: toPet(pet) };
		},
	});

export const petEnrichTool = (_env: Env) =>
	createTool({
		id: "pet_enrich",
		description:
			"Research breed-specific health traits, age-appropriate care, and current conditions via Perplexity. Saves findings to the pet profile.",
		inputSchema: z.object({
			petId: z.string(),
			ageDescription: z
				.string()
				.optional()
				.describe("Free text e.g. '5 years old'"),
			conditionFocus: z
				.string()
				.optional()
				.describe(
					"Optional override of owner_notes for this research call (e.g. specific symptoms to focus on).",
				),
		}),
		outputSchema: z.object({ pet: PetSchema }),
		_meta: { ui: { resourceUri: URI.petEnrich } },
		annotations: { destructiveHint: false, openWorldHint: true },
		execute: async ({ context, runtimeContext }) => {
			const e = runtimeContext.env as Env;
			const pet = await getPet(e, context.petId);
			if (!pet) throw new Error(`Pet not found: ${context.petId}`);
			const enrichment = await enrichPet(e, {
				name: pet.name,
				species: pet.species,
				breed: pet.breed ?? undefined,
				ageDescription: context.ageDescription ?? pet.dob ?? undefined,
				weightKg: pet.weightKg ?? undefined,
				ownerNotes: context.conditionFocus ?? pet.ownerNotes ?? undefined,
			});
			const saved = await setEnrichment(e, pet.id, enrichment);
			return { pet: toPet(saved) };
		},
	});

export const petGetTool = (_env: Env) =>
	createTool({
		id: "pet_get",
		description: "Fetch a pet profile by id.",
		inputSchema: z.object({ petId: z.string() }),
		outputSchema: z.object({ pet: PetSchema.nullable() }),
		_meta: { ui: { resourceUri: URI.petGet } },
		annotations: { readOnlyHint: true },
		execute: async ({ context, runtimeContext }) => {
			const pet = await getPet(runtimeContext.env as Env, context.petId);
			return { pet: toPetOrNull(pet) };
		},
	});

export const petUpdateTool = (_env: Env) =>
	createTool({
		id: "pet_update",
		description:
			"Update a pet's fields. Only provided fields are changed; pass null to clear a field.",
		inputSchema: z.object({
			petId: z.string(),
			name: z.string().optional(),
			species: z.string().optional(),
			breed: z.string().nullable().optional(),
			dob: z.string().nullable().optional(),
			weightKg: z.number().nullable().optional(),
			ownerNotes: z.string().nullable().optional(),
			timezone: z.string().nullable().optional(),
		}),
		outputSchema: z.object({ pet: PetSchema.nullable() }),
		execute: async ({ context, runtimeContext }) => {
			const { petId, ...patch } = context;
			const pet = await updatePet(runtimeContext.env as Env, petId, patch);
			return { pet: toPetOrNull(pet) };
		},
	});

export const petDeleteTool = (_env: Env) =>
	createTool({
		id: "pet_delete",
		description:
			"Soft-delete a pet (and cascade to its episodes). The records stay in the database but are hidden from listings; ask explicitly if you ever need to query them.",
		inputSchema: z.object({ petId: z.string() }),
		outputSchema: z.object({ deleted: z.boolean() }),
		annotations: { destructiveHint: true },
		execute: async ({ context, runtimeContext }) => {
			const ok = await deletePet(runtimeContext.env as Env, context.petId);
			return { deleted: ok };
		},
	});

export const petListTool = (_env: Env) =>
	createTool({
		id: "pet_list",
		description: "List all pets.",
		inputSchema: z.object({}),
		outputSchema: z.object({ pets: z.array(PetSchema) }),
		_meta: { ui: { resourceUri: URI.petList } },
		annotations: { readOnlyHint: true },
		execute: async ({ runtimeContext }) => {
			const rows = await listPets(runtimeContext.env as Env);
			return { pets: rows.map((p) => toPet(p)) };
		},
	});
