import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { petContextBlock } from "../ai/pet-context.ts";
import { vetResearch } from "../ai/vet-research.ts";
import type { Env } from "../env.ts";
import { getSelfPet } from "../storage/pet-self.ts";
import { parseEnrichment, parseProfile } from "../storage/pets.ts";
import {
	listPrescriptions,
	parseScheduleItems,
} from "../storage/prescriptions.ts";
import { listNotes } from "../storage/timeline.ts";

export const vetResearchTool = (_env: Env) =>
	createTool({
		id: "vet_research",
		description: `Run an evidence-based veterinary web search via Perplexity, returning a structured answer with key points, cautions, and cited sources.

Use this tool whenever the user asks something that needs grounded clinical context, e.g.:
- "Will Prelone and Sucralfate interact?"
- "What side effects should I watch for from Cerenia at 8mg for a 9kg dog?"
- "Why might my dog be vomiting again 3 days into treatment?"
- "Is it safe to combine these meds with probiotics?"
- "How long until omeprazole takes effect?"

The pet's profile, active medications, and recent timeline notes are auto-attached as context — you don't pass anything but the question. Summarize the result back to the user in chat, and optionally call timeline_note_add to persist key findings.

Output sections: answer (2–5 sentences), keyPoints (bullets), cautions (red-flag bullets), citations (urls). The tool does NOT replace a vet — present results as research to support the user's conversation with their veterinarian.`,
		inputSchema: z.object({
			question: z
				.string()
				.min(3)
				.describe(
					"The specific question to research. Be concrete — 'Will X and Y interact?' beats 'Tell me about X'.",
				),
			extraContext: z
				.string()
				.optional()
				.describe(
					"Free-text extra context the agent wants to add (e.g. transcribed vet phrasing). Appended to the prompt.",
				),
		}),
		outputSchema: z.object({
			answer: z.string(),
			keyPoints: z.array(z.string()),
			cautions: z.array(z.string()),
			citations: z.array(z.object({ title: z.string(), url: z.string() })),
			generatedAt: z.string(),
			sourceQuery: z.string(),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;

			// Single-pet deploy: pet profile + active meds + recent notes are
			// always auto-attached.
			const pet = await getSelfPet(env);
			const enrichment = pet ? parseEnrichment(pet) : null;
			const profile = pet ? parseProfile(pet) : null;
			const conditionsParts: string[] = [];
			// Lead with the structured case file (allergies, chronic conditions,
			// active concerns, watch-for) so research is grounded in the same
			// overview as every other AI call.
			if (pet && profile) conditionsParts.push(petContextBlock(pet, profile));
			else if (pet?.ownerNotes) conditionsParts.push(pet.ownerNotes);
			if (enrichment?.conditionNotes)
				conditionsParts.push(`AI research: ${enrichment.conditionNotes}`);

			const activeMedications: {
				name: string;
				dosage?: string | null;
				route?: string | null;
				frequencyHours?: number | null;
			}[] = [];

			const [rxRows, noteRows] = await Promise.all([
				listPrescriptions(env),
				listNotes(env),
			]);
			for (const rx of rxRows) {
				if (rx.status !== "confirmed") continue;
				for (const it of parseScheduleItems(rx)) {
					if (it.kind !== "medication") continue;
					activeMedications.push({
						name: it.name,
						dosage: it.dosage ?? null,
						route: it.route ?? null,
						frequencyHours: it.frequencyHours ?? null,
					});
				}
			}
			const recentNotes = noteRows.slice(0, 5).map((n) => n.content);

			const baseQuestion = context.extraContext
				? `${context.question}\n\nAdditional context: ${context.extraContext}`
				: context.question;

			const result = await vetResearch(env, {
				question: baseQuestion,
				petContext: pet
					? {
							name: pet.name,
							species: pet.species,
							breed: pet.breed,
							ageDescription: pet.dob,
							weightKg: pet.weightKg,
							conditions: conditionsParts.join("\n\n") || null,
						}
					: undefined,
				activeMedications:
					activeMedications.length > 0 ? activeMedications : undefined,
				recentNotes: recentNotes.length > 0 ? recentNotes : undefined,
			});

			return {
				answer: result.answer,
				keyPoints: result.keyPoints,
				cautions: result.cautions,
				citations: result.citations,
				generatedAt: result.generatedAt,
				sourceQuery: result.sourceQuery,
			};
		},
	});
