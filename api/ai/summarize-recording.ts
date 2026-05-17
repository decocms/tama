import type { Env } from "../env.ts";
import { anthropicMessages } from "./gateway.ts";

export interface SummarizeInput {
	petContext: {
		name: string;
		species: string;
		breed?: string | null;
		dob?: string | null;
		weightKg?: number | null;
		ownerNotes?: string | null;
	};
	episodeContext: {
		title: string;
		summary?: string | null;
		existingNotes: string[];
	};
	transcript: string;
}

export interface SummarizeOutput {
	summary: string;
	historyUpdate: string;
	episodeNote: string;
	rawAiText: string;
}

const SYSTEM_PROMPT = `You are a veterinary care assistant. The user is sharing a transcript of a vet appointment (or related conversation) about their pet. Produce THREE distinct outputs as JSON in a fenced code block.

Output JSON shape:
{
  "summary": "2-4 sentences: the gist of the conversation",
  "historyUpdate": "Long-term facts about the pet to add to their permanent profile: chronic conditions, allergies, baseline behaviors, prior diagnoses, age-related notes. Empty string if nothing new for the long-term profile.",
  "episodeNote": "Time-bound observations and actions about THIS current episode: new symptoms, diagnosis updates, treatment changes, vet instructions, dates, follow-up plans. Empty string if the conversation was not about the current episode."
}

Rules:
- Do NOT invent facts. Stick to what the transcript actually says.
- Use the existing pet history and episode notes to avoid duplicating known facts.
- Write in the same language the transcript uses.
- Output ONLY the fenced JSON block, no prose around it.`;

function buildUserMessage(input: SummarizeInput): string {
	const lines: string[] = [];
	lines.push(
		`Pet: ${input.petContext.name} (${input.petContext.species}${input.petContext.breed ? `, ${input.petContext.breed}` : ""})`,
	);
	if (input.petContext.dob) lines.push(`Age: ${input.petContext.dob}`);
	if (input.petContext.weightKg)
		lines.push(`Weight: ${input.petContext.weightKg} kg`);
	if (input.petContext.ownerNotes)
		lines.push(`Existing pet notes: ${input.petContext.ownerNotes}`);
	lines.push("");
	lines.push(`Current episode: ${input.episodeContext.title}`);
	if (input.episodeContext.summary)
		lines.push(`Episode summary: ${input.episodeContext.summary}`);
	if (input.episodeContext.existingNotes.length > 0) {
		lines.push("Existing episode notes:");
		for (const n of input.episodeContext.existingNotes.slice(0, 10)) {
			lines.push(`- ${n.slice(0, 500)}`);
		}
	}
	lines.push("");
	lines.push("Transcript:");
	lines.push(input.transcript);
	return lines.join("\n");
}

function stripJsonFence(text: string): string {
	const fenced = text.match(/```json\s*([\s\S]*?)```/);
	if (fenced) return fenced[1].trim();
	const generic = text.match(/```\s*([\s\S]*?)```/);
	if (generic) return generic[1].trim();
	return text.trim();
}

export async function summarizeRecording(
	env: Env,
	input: SummarizeInput,
): Promise<SummarizeOutput> {
	const res = await anthropicMessages(env, {
		model: "claude-opus-4-7",
		max_tokens: 2048,
		system: SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content: [{ type: "text", text: buildUserMessage(input) }],
			},
		],
	});
	const rawAiText = res.content.find((c) => c.type === "text")?.text ?? "";
	let parsed: {
		summary?: string;
		historyUpdate?: string;
		episodeNote?: string;
	};
	try {
		parsed = JSON.parse(stripJsonFence(rawAiText));
	} catch {
		parsed = {};
	}
	return {
		summary: parsed.summary ?? "",
		historyUpdate: parsed.historyUpdate ?? "",
		episodeNote: parsed.episodeNote ?? "",
		rawAiText,
	};
}
