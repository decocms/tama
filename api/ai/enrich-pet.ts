import type { Env } from "../env.ts";
import type { Enrichment } from "../tools/shared.ts";
import { perplexityChat } from "./gateway.ts";

export interface EnrichInput {
	name: string;
	species: string;
	breed?: string;
	ageDescription?: string;
	weightKg?: number;
	ownerNotes?: string;
}

function buildQuery(input: EnrichInput): string {
	const lines = [
		`Pet name: ${input.name}`,
		`Species: ${input.species}`,
		input.breed ? `Breed: ${input.breed}` : null,
		input.ageDescription ? `Age: ${input.ageDescription}` : null,
		input.weightKg ? `Weight: ${input.weightKg} kg` : null,
		input.ownerNotes ? `Owner notes: ${input.ownerNotes}` : null,
	].filter(Boolean);
	return lines.join("\n");
}

const SYSTEM_PROMPT = `You research pet health for an owner. Be concrete and cite reputable sources (veterinary schools, peer-reviewed papers, AVMA, etc.).

Given a pet description, produce THREE short, distinct sections — return raw text formatted exactly like:

## Breed
<2-4 sentences about breed-specific health traits and watch-outs>

## Age
<2-4 sentences about age-appropriate care for the described age>

## Current conditions
<2-4 sentences specifically addressing the owner's notes about current symptoms or conditions; if no relevant notes, say "No specific conditions reported.">

Then list sources as "## Sources" with bullet points "- Title — URL". Use only URLs returned by your search.`;

export async function enrichPet(
	env: Env,
	input: EnrichInput,
): Promise<Enrichment> {
	const sourceQuery = buildQuery(input);

	const res = await perplexityChat(env, {
		model: "sonar-pro",
		return_citations: true,
		max_tokens: 1500,
		messages: [
			{ role: "system", content: SYSTEM_PROMPT },
			{ role: "user", content: sourceQuery },
		],
	});

	const text = res.choices?.[0]?.message?.content ?? "";
	const breedNotes = sliceSection(text, "Breed");
	const ageNotes = sliceSection(text, "Age");
	const conditionNotes = sliceSection(text, "Current conditions");
	const sources = sliceSection(text, "Sources");

	const citations = parseCitations(sources, res.citations);

	return {
		breedNotes,
		ageNotes,
		conditionNotes,
		citations,
		generatedAt: new Date().toISOString(),
		sourceQuery,
	};
}

function sliceSection(text: string, header: string): string {
	const re = new RegExp(
		`##\\s+${header}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
		"i",
	);
	const m = text.match(re);
	return m ? m[1].trim() : "";
}

function parseCitations(
	sourcesSection: string,
	apiCitations: string[] | undefined,
): { title: string; url: string }[] {
	const lines = sourcesSection
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.startsWith("-"));
	const fromText = lines
		.map((l) => {
			const m = l.match(/^-\s*(.+?)\s*[—–-]\s*(https?:\/\/\S+)/);
			if (m) return { title: m[1], url: m[2] };
			const urlOnly = l.match(/(https?:\/\/\S+)/);
			return urlOnly ? { title: urlOnly[1], url: urlOnly[1] } : null;
		})
		.filter((c): c is { title: string; url: string } => c !== null);

	if (fromText.length > 0) return fromText;
	if (apiCitations && apiCitations.length > 0) {
		return apiCitations.map((url) => ({ title: url, url }));
	}
	return [];
}
