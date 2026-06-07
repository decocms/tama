import type { Env } from "../env.ts";
import type { TimelineEntry } from "../storage/timeline.ts";
import { anthropicMessages } from "./gateway.ts";

// Generates the ONE evolving status summary for the pet from its whole
// timeline. Replaces the old per-episode insights. Short, warm, vet-aware
// prose an owner (or a vet reading the case) can absorb in 10 seconds:
// where things stand now, what's active, what to watch.

export interface PetSummaryInput {
	pet: {
		name: string;
		species: string;
		breed?: string | null;
		dob?: string | null;
		weightKg?: number | null;
		ownerNotes?: string | null;
	};
	activeMedications: string[];
	timeline: TimelineEntry[]; // already reverse-chron
}

const SYSTEM_PROMPT = `You are a veterinary care assistant maintaining a living summary of one pet's health.

Given the pet's profile, its active medications, and a reverse-chronological slice of its timeline (vet visits, vaccines, symptoms, doses, exams, notes), write a concise status summary an owner OR a collaborating vet can read in ~10 seconds.

Rules:
- 2-4 short sentences, plain language, warm but clinical.
- Lead with how the pet is doing right now, then active treatments, then anything to watch.
- Reference concrete events ("hemoglobin recovering since the May exam", "on Prelone since…") — no generic filler.
- Do NOT invent facts not in the timeline. Do NOT add disclaimers.
- Write in the pet owner's language — match the language of the timeline/records (e.g. Brazilian Portuguese when they're in Portuguese).
- Return ONLY the summary prose, no headings, no JSON.`;

export async function generatePetSummary(
	env: Env,
	input: PetSummaryInput,
): Promise<string> {
	const profile = [
		`${input.pet.name} — ${input.pet.species}${input.pet.breed ? `, ${input.pet.breed}` : ""}`,
		input.pet.dob ? `DOB/age: ${input.pet.dob}` : null,
		input.pet.weightKg ? `${input.pet.weightKg} kg` : null,
		input.pet.ownerNotes ? `Owner notes: ${input.pet.ownerNotes}` : null,
	]
		.filter(Boolean)
		.join(" · ");

	const meds =
		input.activeMedications.length > 0
			? input.activeMedications.join(", ")
			: "none currently active";

	const timelineText = input.timeline
		.slice(0, 60)
		.map((e) => `${e.at.slice(0, 10)} [${e.type}] ${e.title}${e.detail ? ` — ${e.detail}` : ""}`)
		.join("\n");

	const res = await anthropicMessages(env, {
		model: "claude-opus-4-7",
		max_tokens: 512,
		system: SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content: `PROFILE: ${profile}\n\nACTIVE MEDICATIONS: ${meds}\n\nTIMELINE (most recent first):\n${timelineText || "(empty)"}`,
			},
		],
	});
	return res.content.find((c) => c.type === "text")?.text?.trim() ?? "";
}
