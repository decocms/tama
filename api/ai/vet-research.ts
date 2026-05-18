import type { Env } from "../env.ts";
import { perplexityChat } from "./gateway.ts";

export interface VetResearchInput {
	question: string;
	// Optional structured context the agent can attach to ground the answer.
	// Each field is folded into the prompt verbatim — pass only what's
	// relevant to keep the search focused.
	petContext?: {
		name?: string;
		species?: string;
		breed?: string | null;
		ageDescription?: string | null;
		weightKg?: number | null;
		conditions?: string | null;
	};
	episodeContext?: {
		title?: string;
		summary?: string | null;
		dayNumber?: number;
	};
	activeMedications?: Array<{
		name: string;
		dosage?: string | null;
		route?: string | null;
		frequencyHours?: number | null;
	}>;
	recentNotes?: string[];
}

export interface VetResearchResult {
	answer: string;
	keyPoints: string[];
	cautions: string[];
	citations: { title: string; url: string }[];
	rawAiText: string;
	generatedAt: string;
	sourceQuery: string;
}

const SYSTEM_PROMPT = `You are a careful veterinary research assistant working ALONGSIDE a vet, not replacing one. Given a question from a pet owner (plus optional pet/episode context), you search the web and return evidence-based information from reputable veterinary sources (AVMA, ACVIM, veterinary school sites, peer-reviewed papers, drug compendiums like Plumb's). Your output helps the owner have a more informed conversation with their vet — it is NEVER a substitute for clinical judgment.

Output format (raw text, sections in this exact order):

## Answer
2–5 short sentences directly addressing the question. Be specific to the pet and meds in the context when provided. State uncertainty plainly when the evidence is thin.

## Key points
- 2–5 bullet points with concrete facts (mechanism, typical dosing range, expected timeline, common side effects, monitoring suggestions). Each bullet ≤ 25 words.

## Cautions
- 1–3 bullet points flagging contraindications, drug interactions, breed/age-specific risks, or red-flag symptoms that warrant urgent vet contact. Each bullet ≤ 30 words. Omit the section entirely if there is nothing concrete to flag.

## Sources
- Bullet list, format: "- Title — https://url". Only include URLs you actually used to ground the answer.

Rules:
- Write in the same language as the user's question.
- Do NOT invent dosages or interactions. If you're not sure, say so and recommend vet confirmation.
- Prefer canine/feline veterinary sources over generic medical sources.
- Never include disclaimers like "I'm an AI" or "consult a vet" as filler — only flag concrete clinical concerns under Cautions.`;

function buildQuery(input: VetResearchInput): string {
	const lines: string[] = [`Question: ${input.question}`];

	if (input.petContext) {
		const p = input.petContext;
		const desc = [
			p.species,
			p.breed,
			p.ageDescription,
			p.weightKg ? `${p.weightKg}kg` : null,
		]
			.filter(Boolean)
			.join(", ");
		if (desc) lines.push(`Pet: ${p.name ?? "(unnamed)"} — ${desc}`);
		if (p.conditions) lines.push(`Known conditions / history: ${p.conditions}`);
	}

	if (input.episodeContext) {
		const e = input.episodeContext;
		const eparts: string[] = [];
		if (e.title) eparts.push(`"${e.title}"`);
		if (e.dayNumber) eparts.push(`day ${e.dayNumber}`);
		if (eparts.length > 0) lines.push(`Current episode: ${eparts.join(", ")}`);
		if (e.summary) lines.push(`Episode summary: ${e.summary}`);
	}

	if (input.activeMedications && input.activeMedications.length > 0) {
		lines.push("Active medications:");
		for (const m of input.activeMedications) {
			const parts = [m.name];
			if (m.dosage) parts.push(m.dosage);
			if (m.route) parts.push(`(${m.route})`);
			if (m.frequencyHours) parts.push(`every ${m.frequencyHours}h`);
			lines.push(`- ${parts.join(" ")}`);
		}
	}

	if (input.recentNotes && input.recentNotes.length > 0) {
		lines.push("Recent owner notes:");
		for (const n of input.recentNotes.slice(0, 5)) {
			lines.push(`- ${n.slice(0, 400)}`);
		}
	}

	return lines.join("\n");
}

function sliceSection(text: string, header: string): string {
	const re = new RegExp(
		`##\\s+${header}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
		"i",
	);
	const m = text.match(re);
	return m ? m[1].trim() : "";
}

function parseBullets(text: string): string[] {
	return text
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.startsWith("-") || l.startsWith("•"))
		.map((l) => l.replace(/^[-•]\s*/, "").trim())
		.filter((l) => l.length > 0);
}

function parseCitations(
	sourcesSection: string,
	apiCitations: string[] | undefined,
): { title: string; url: string }[] {
	const lines = sourcesSection
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.startsWith("-") || l.startsWith("•"));
	const fromText = lines
		.map((l) => {
			const m = l.match(/^[-•]\s*(.+?)\s*[—–-]\s*(https?:\/\/\S+)/);
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

export async function vetResearch(
	env: Env,
	input: VetResearchInput,
): Promise<VetResearchResult> {
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

	const rawAiText = res.choices?.[0]?.message?.content ?? "";
	const answer = sliceSection(rawAiText, "Answer");
	const keyPoints = parseBullets(sliceSection(rawAiText, "Key points"));
	const cautions = parseBullets(sliceSection(rawAiText, "Cautions"));
	const citations = parseCitations(
		sliceSection(rawAiText, "Sources"),
		res.citations,
	);

	return {
		answer,
		keyPoints,
		cautions,
		citations,
		rawAiText,
		generatedAt: new Date().toISOString(),
		sourceQuery,
	};
}
