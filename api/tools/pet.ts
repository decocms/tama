import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { buildPetProfile, PetProfileSchema } from "../ai/pet-context.ts";
import type { Env } from "../env.ts";
import { getMetricSeriesForPet } from "../storage/exams.ts";
import { getSelfPet, PET_SELF_ID } from "../storage/pet-self.ts";
import {
	parseProfile,
	parseSpritePack,
	parseSvgPack,
	setProfile,
	updatePet,
} from "../storage/pets.ts";
import { addResearch } from "../storage/researches.ts";
import { getTimeline } from "../storage/timeline.ts";
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
	spritePack: SpritePackSchema.nullable(),
	svgPack: z.record(z.string(), z.string()).nullable(),
	profile: PetProfileSchema.nullable(),
	companionState: z.string().nullable(),
	companionStateAt: z.string().nullable(),
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
		spritePack: parseSpritePack(p),
		svgPack: parseSvgPack(p),
		profile: parseProfile(p),
		companionState: p.companionState,
		companionStateAt: p.companionStateAt,
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
			companionState: z
				.enum(["idle", "sleeping", "happy", "hungry", "pill-time", "sad"])
				.nullable()
				.optional()
				.describe(
					"The companion's current mood the owner is declaring (asleep/happy/etc.). Sets the baseline the ambient companion shows; live schedule events (meal soon, med overdue) override it and it ages out after ~12h. null to clear.",
				),
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

export const petProfileRefreshTool = (_env: Env) =>
	createTool({
		id: "pet_profile_refresh",
		description:
			"AI REBUILD of the pet's structured case file (the 'pet sheet': one-liner, age, weight, diet, allergies, chronic conditions, active concerns, past episodes, current meds, what to watch). Re-synthesizes the WHOLE sheet from owner notes + timeline + lab exams — overwriting it. Use this for a fresh resync after a lot has changed (new diagnosis, batch of exams). For a targeted fix to one field or list, use pet_profile_update instead — don't regenerate the whole thing. This sheet is the grounded context injected into all AI research and analysis.",
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

			const sourceText = `Owner notes: ${pet.ownerNotes ?? "(none)"}\n\nTimeline (recent first):\n${timelineText}\n\nLab metrics (oldest→newest):\n${examText}`;

			const profile = await buildPetProfile(env, {
				pet: {
					name: pet.name,
					species: pet.species,
					breed: pet.breed,
					dob: pet.dob,
					weightKg: pet.weightKg,
					ownerNotes: pet.ownerNotes,
				},
				sourceText,
			});
			await setProfile(env, PET_SELF_ID, profile);

			// Log this AI synthesis to the Research history, so every AI output
			// (vet_research, exam_explain insights, and this case-file rebuild)
			// lands in one provenance log. Manual edits via pet_profile_update do
			// NOT log here — only AI runs do.
			const section = (label: string, arr?: string[] | null) =>
				arr && arr.length
					? `${label}:\n${arr.map((x) => `• ${x}`).join("\n")}`
					: "";
			const answer =
				[
					profile.oneLiner,
					profile.diet ? `Diet: ${profile.diet}` : "",
					section("Allergies", profile.allergies),
					section("Chronic conditions", profile.chronicConditions),
					section("Active concerns", profile.activeConcerns),
					section("Current medications", profile.medications),
					section("Watch for", profile.watchFor),
					section("Past episodes", profile.pastEpisodes),
				]
					.filter(Boolean)
					.join("\n\n") || "(empty)";
			await addResearch(env, {
				question: "Pet sheet rebuilt (AI synthesis)",
				answer,
				keyPoints: profile.activeConcerns ?? [],
				cautions: profile.watchFor ?? [],
				citations: [],
			});

			return { profile };
		},
	});

export const petProfileUpdateTool = (_env: Env) =>
	createTool({
		id: "pet_profile_update",
		description:
			"MANUAL edit of specific fields of the pet's case file (the 'pet sheet' shown on the Pet page) — no AI, no regeneration, instant. This is the PREFERRED way to change the sheet: when the owner tells you a fact (a new diagnosis, a med stopped, an allergy, a resolved episode), edit the relevant field directly here instead of running pet_profile_refresh. Only the fields you pass change; everything else is preserved. The array fields (allergies, chronicConditions, activeConcerns, pastEpisodes, medications, watchFor) REPLACE the whole list — so call pet_profile FIRST, take that list, add/remove the one item, and send the full edited list back (don't send a single item, you'd wipe the rest).",
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
