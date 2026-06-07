import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { enrichPet } from "../ai/enrich-pet.ts";
import { buildPetProfile, PetProfileSchema } from "../ai/pet-context.ts";
import type { Env } from "../env.ts";
import { getMetricSeriesForPet } from "../storage/exams.ts";
import { getSelfPet, PET_SELF_ID } from "../storage/pet-self.ts";
import {
	parseEnrichment,
	parseProfile,
	parseSpritePack,
	parseSvgPack,
	setEnrichment,
	setProfile,
	updatePet,
} from "../storage/pets.ts";
import { getTimeline } from "../storage/timeline.ts";
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
	location: z.string().nullable(),
	enrichment: EnrichmentSchema.nullable(),
	spritePack: SpritePackSchema.nullable(),
	svgPack: z.record(z.string(), z.string()).nullable(),
	profile: PetProfileSchema.nullable(),
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
		location: p.location,
		enrichment: parseEnrichment(p),
		spritePack: parseSpritePack(p),
		svgPack: parseSvgPack(p),
		profile: parseProfile(p),
		createdAt: p.createdAt,
	};
}

// Single-pet shape: every tool that used to take `petId` now operates on the
// well-known singleton at PET_SELF_ID. There is no pet_create / pet_list /
// pet_delete — this deployment IS the pet. To set up a different pet, fork
// the repo and create an agent for that pet (see AGENTS.md).

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
			location: z
				.string()
				.nullable()
				.optional()
				.describe("Owner-facing city/location, e.g. 'Rio de Janeiro'."),
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

export const petProfileRefreshTool = (_env: Env) =>
	createTool({
		id: "pet_profile_refresh",
		description:
			"Rebuild the pet's structured case file (one-liner, age, weight, allergies, chronic conditions, active concerns, past episodes, current meds, what to watch) by synthesizing the owner notes + timeline + lab exams. This profile is the grounded context injected into all AI research and analysis. Run after big changes (new diagnosis, exams, meds).",
		inputSchema: z.object({}),
		outputSchema: z.object({ profile: PetProfileSchema }),
		execute: async ({ runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const pet = await getSelfPet(env);
			if (!pet) throw new Error("pet_self row missing");

			const [timeline, series] = await Promise.all([
				getTimeline(env, { limit: 80 }),
				getMetricSeriesForPet(env),
			]);

			const timelineText =
				timeline
					.map(
						(e) =>
							`- ${(e.at ?? "").slice(0, 10)} [${e.type}] ${e.title}${e.detail ? `: ${e.detail}` : ""}`,
					)
					.join("\n") || "(no timeline entries)";

			// Latest + range per metric, so the model sees current state + trend.
			const byKey = new Map<string, typeof series>();
			for (const r of series) {
				if (r.valueNum == null) continue;
				const arr = byKey.get(r.canonicalKey) ?? [];
				arr.push(r);
				byKey.set(r.canonicalKey, arr);
			}
			const examText =
				Array.from(byKey.values())
					.map((rows) => {
						rows.sort((a, b) => a.performedAt.localeCompare(b.performedAt));
						const last = rows[rows.length - 1];
						const name = last.displayName || last.canonicalKey;
						const u = last.unit ?? "";
						const trend = rows.map((r) => `${r.valueNum}`).join("→");
						const ref =
							last.refLow != null && last.refHigh != null
								? ` [normal ${last.refLow}-${last.refHigh}]`
								: "";
						return `- ${name}: ${trend}${u ? ` ${u}` : ""}${ref}`;
					})
					.join("\n") || "(no lab metrics)";

			const sourceText = `Owner notes: ${pet.ownerNotes ?? "(none)"}\nCurrent status: ${pet.summary ?? "(none)"}\n\nTimeline (recent first):\n${timelineText}\n\nLab metrics (oldest→newest):\n${examText}`;

			const profile = await buildPetProfile(env, {
				pet: {
					name: pet.name,
					species: pet.species,
					breed: pet.breed,
					dob: pet.dob,
					weightKg: pet.weightKg,
					ownerNotes: pet.ownerNotes,
					summary: pet.summary,
				},
				sourceText,
			});
			await setProfile(env, PET_SELF_ID, profile);
			return { profile };
		},
	});

export const petProfileUpdateTool = (_env: Env) =>
	createTool({
		id: "pet_profile_update",
		description:
			"Directly edit specific fields of the pet's case file (pet sheet) WITHOUT regenerating from the timeline. Only the fields you pass change; everything else is preserved. Array fields (allergies, chronicConditions, activeConcerns, pastEpisodes, medications, watchFor) REPLACE the whole list — read pet_profile first, edit the list, send it back. Use this for surgical fixes (e.g. drop a discontinued medication, fix one allergy) instead of pet_profile_refresh.",
		inputSchema: z.object({
			oneLiner: z.string().optional(),
			sex: z.string().nullable().optional(),
			ageText: z.string().nullable().optional(),
			weightKg: z.number().nullable().optional(),
			diet: z.string().nullable().optional(),
			allergies: z.array(z.string()).optional(),
			chronicConditions: z.array(z.string()).optional(),
			activeConcerns: z.array(z.string()).optional(),
			pastEpisodes: z.array(z.string()).optional(),
			medications: z.array(z.string()).optional(),
			watchFor: z.array(z.string()).optional(),
		}),
		outputSchema: z.object({ profile: PetProfileSchema }),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const pet = await getSelfPet(env);
			if (!pet) throw new Error("pet_self row missing");
			// Start from the current sheet (or an empty one) and overlay ONLY the
			// keys actually provided, so unspecified fields/arrays are untouched.
			const base = parseProfile(pet) ?? PetProfileSchema.parse({ oneLiner: "" });
			const patch = Object.fromEntries(
				Object.entries(context).filter(([, v]) => v !== undefined),
			);
			const merged = PetProfileSchema.parse({ ...base, ...patch });
			await setProfile(env, PET_SELF_ID, merged);
			return { profile: merged };
		},
	});
