import { z } from "zod";
import type { Env } from "../env.ts";
import { anthropicMessages } from "./gateway.ts";

// The structured "case file" — a compact RPG-style character sheet of the pet's
// medical reality. Synthesized from owner notes + timeline + exams, stored on
// the pet, and always injected as context into AI research/analysis so every
// call shares the same grounded overview (not just free-text owner notes).
export const PetProfileSchema = z.object({
	oneLiner: z
		.string()
		.describe("One line: signalment + the headline of the case."),
	sex: z.string().nullable().optional(),
	ageText: z.string().nullable().optional(),
	weightKg: z.number().nullable().optional(),
	diet: z.string().nullable().optional(),
	allergies: z.array(z.string()).default([]),
	chronicConditions: z.array(z.string()).default([]),
	activeConcerns: z.array(z.string()).default([]),
	pastEpisodes: z.array(z.string()).default([]),
	medications: z.array(z.string()).default([]),
	watchFor: z.array(z.string()).default([]),
});
export type PetProfile = z.infer<typeof PetProfileSchema>;

export interface BasePet {
	name: string;
	species: string;
	breed: string | null;
	dob: string | null;
	weightKg: number | null;
	ownerNotes: string | null;
}

// Render the pet + structured profile as a compact text block for prompts.
// Falls back to owner notes when no structured profile exists yet.
export function petContextBlock(
	pet: BasePet,
	profile: PetProfile | null,
): string {
	const head = [
		`Pet: ${pet.name}`,
		`Species/breed: ${pet.species}${pet.breed ? ` (${pet.breed})` : ""}`,
		pet.dob ? `DOB/age: ${pet.dob}` : "",
		pet.weightKg ? `Weight: ${pet.weightKg} kg` : "",
	]
		.filter(Boolean)
		.join(" · ");

	if (!profile) {
		const notes = pet.ownerNotes ? `\nOwner notes: ${pet.ownerNotes}` : "";
		return `${head}${notes}`;
	}

	const list = (label: string, arr: string[] | undefined) =>
		arr && arr.length ? `\n${label}: ${arr.join("; ")}` : "";

	return [
		head,
		profile.oneLiner ? `\n${profile.oneLiner}` : "",
		profile.diet ? `\nDiet: ${profile.diet}` : "",
		list("Allergies", profile.allergies),
		list("Chronic conditions", profile.chronicConditions),
		list("Active concerns", profile.activeConcerns),
		list("Current medications", profile.medications),
		list("Past episodes", profile.pastEpisodes),
		list("Watch for", profile.watchFor),
	].join("");
}

const SYSTEM = `You maintain a structured "case file" for a pet from its records. Extract durable, decision-relevant facts an owner and vet would want at a glance — NOT a narrative. Be specific and concise; use the pet's real data, never invent. Empty arrays are fine when unknown.

LANGUAGE: Write every string VALUE in the same language as the pet's records (the owner's language) — e.g. Brazilian Portuguese when the records are in Portuguese. Keep the JSON keys exactly as below (English).

Return ONLY a single fenced JSON code block matching:
{
  "oneLiner": string,            // signalment + case headline, e.g. "Chihuahua macho 6a, GI crônico + anemia regenerativa"
  "sex": string|null,
  "ageText": string|null,
  "weightKg": number|null,
  "diet": string|null,
  "allergies": string[],
  "chronicConditions": string[],
  "activeConcerns": string[],     // what's open right now
  "pastEpisodes": string[],       // notable resolved events, short
  "medications": string[],        // CURRENT/active meds only, with dose if known — exclude discontinued/suspended drugs (a notably suspended one can go in pastEpisodes)
  "watchFor": string[]            // signs to monitor
}
Nothing outside the JSON block.`;

function stripFence(text: string): string {
	// Lenient: handle a full ```json … ``` block, an UNTERMINATED fence (model
	// ran long / forgot to close), or no fence at all.
	const full = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/```\s*([\s\S]*?)```/);
	if (full) return full[1].trim();
	return text
		.trim()
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/```\s*$/i, "")
		.trim();
}

export async function buildPetProfile(
	env: Env,
	input: { pet: BasePet; sourceText: string },
): Promise<PetProfile> {
	const res = await anthropicMessages(env, {
		model: "claude-opus-4-7",
		max_tokens: 1600,
		system: SYSTEM,
		messages: [
			{
				role: "user",
				content: `Pet: ${input.pet.name} — ${input.pet.species}${input.pet.breed ? ` (${input.pet.breed})` : ""}${input.pet.dob ? `, DOB/age ${input.pet.dob}` : ""}${input.pet.weightKg ? `, ${input.pet.weightKg} kg` : ""}.\n\nRecords:\n${input.sourceText}`,
			},
		],
	});
	const text = res.content.find((c) => c.type === "text")?.text ?? "";
	return PetProfileSchema.parse(JSON.parse(stripFence(text)));
}
