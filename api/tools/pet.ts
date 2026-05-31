import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { enrichPet } from "../ai/enrich-pet.ts";
import type { Env } from "../env.ts";
import { getSelfPet, PET_SELF_ID } from "../storage/pet-self.ts";
import {
	parseEnrichment,
	parseSpritePack,
	setEnrichment,
	updatePet,
} from "../storage/pets.ts";
import { EnrichmentSchema } from "./shared.ts";
import { URI } from "./uris.ts";

const SpritePackSchema = z.object({
	idle: z.string(),
	happy: z.string(),
	hungry: z.string(),
	"pill-time": z.string(),
	sad: z.string(),
	sleeping: z.string(),
	size: z.number().optional(),
});

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
	spritePack: SpritePackSchema.nullable(),
	createdAt: z.string(),
});

function toPet(p: NonNullable<Awaited<ReturnType<typeof getSelfPet>>>) {
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
		spritePack: parseSpritePack(p),
		createdAt: p.createdAt,
	};
}

// Single-pet shape: every tool that used to take `petId` now operates on the
// well-known singleton at PET_SELF_ID. There is no pet_create / pet_list /
// pet_delete — this deployment IS the pet. To onboard a different pet, fork
// the repo and run the claim flow (see AGENTS.md).

export const petProfileTool = (_env: Env) =>
	createTool({
		id: "pet_profile",
		description: "Fetch the profile of the pet this deployment is for.",
		inputSchema: z.object({}),
		outputSchema: z.object({ pet: PetSchema.nullable() }),
		_meta: { ui: { resourceUri: URI.petGet } },
		annotations: { readOnlyHint: true },
		execute: async ({ runtimeContext }) => {
			const pet = await getSelfPet(runtimeContext.env as Env);
			return { pet: pet ? toPet(pet) : null };
		},
	});

export const petUpdateTool = (_env: Env) =>
	createTool({
		id: "pet_update",
		description:
			"Update the pet's profile fields. Only provided fields change; pass null to clear.",
		inputSchema: z.object({
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
			const pet = await updatePet(
				runtimeContext.env as Env,
				PET_SELF_ID,
				context,
			);
			return { pet: pet ? toPet(pet) : null };
		},
	});

export const petEnrichTool = (_env: Env) =>
	createTool({
		id: "pet_enrich",
		description:
			"Research breed-specific health traits, age-appropriate care, and current conditions via Perplexity. Saves findings to the pet profile.",
		inputSchema: z.object({
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
			const pet = await getSelfPet(e);
			if (!pet) throw new Error("pet_self row missing");
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
