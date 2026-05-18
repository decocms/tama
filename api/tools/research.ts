import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { vetResearch } from "../ai/vet-research.ts";
import type { Env } from "../env.ts";
import { listDoses } from "../storage/doses.ts";
import { getEpisode, listNotes } from "../storage/episodes.ts";
import { getPet, parseEnrichment } from "../storage/pets.ts";
import {
	listPrescriptions,
	parseScheduleItems,
} from "../storage/prescriptions.ts";

function daysSinceIso(iso: string): number {
	const ms = Date.now() - new Date(iso).getTime();
	return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}

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

Best practice: pass petId and/or episodeId so the tool auto-loads pet profile, active prescriptions, and recent notes — this dramatically improves answer quality. The agent should then summarize the result back to the user in chat, and optionally call episode_add_note to persist key findings.

Output sections: answer (2–5 sentences), keyPoints (bullets), cautions (red-flag bullets), citations (urls). The tool does NOT replace a vet — present results as research to support the user's conversation with their veterinarian.`,
		inputSchema: z.object({
			question: z
				.string()
				.min(3)
				.describe(
					"The specific question to research. Be concrete — 'Will X and Y interact?' beats 'Tell me about X'.",
				),
			petId: z
				.string()
				.optional()
				.describe(
					"If provided, pet profile + AI enrichment are auto-attached as context.",
				),
			episodeId: z
				.string()
				.optional()
				.describe(
					"If provided, the episode's active medications + recent notes are auto-attached as context. Implies petId from the episode.",
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

			// Resolve pet/episode context. Episode wins if both passed — petId is
			// derived from it. Either may be absent, in which case the tool just
			// runs on the raw question.
			let petId = context.petId ?? null;
			let episode: Awaited<ReturnType<typeof getEpisode>> = null;
			if (context.episodeId) {
				episode = await getEpisode(env, context.episodeId);
				if (episode) petId = episode.petId;
			}

			const pet = petId ? await getPet(env, petId) : null;
			const enrichment = pet ? parseEnrichment(pet) : null;
			const conditionsParts: string[] = [];
			if (pet?.ownerNotes) conditionsParts.push(pet.ownerNotes);
			if (enrichment?.conditionNotes)
				conditionsParts.push(`AI research: ${enrichment.conditionNotes}`);

			const activeMedications: {
				name: string;
				dosage?: string | null;
				route?: string | null;
				frequencyHours?: number | null;
			}[] = [];
			let recentNotes: string[] = [];

			if (episode) {
				const [rxRows, _doses, noteRows] = await Promise.all([
					listPrescriptions(env, episode.id),
					listDoses(env, episode.id),
					listNotes(env, episode.id),
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
				recentNotes = noteRows
					.slice()
					.sort(
						(a, b) =>
							new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
					)
					.slice(0, 5)
					.map((n) => n.content);
			}

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
				episodeContext: episode
					? {
							title: episode.title,
							summary: episode.summary,
							dayNumber: daysSinceIso(episode.startedAt),
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
