import { z } from "zod";
import type { Env } from "../env.ts";
import { anthropicMessages } from "./gateway.ts";

// One extracted care-team member. Everything but the name is best-effort —
// the model leaves a field null when the records don't mention it.
export const ExtractedVetSchema = z.object({
	name: z.string(),
	role: z.string().nullable().optional(),
	clinic: z.string().nullable().optional(),
	phone: z.string().nullable().optional(),
	email: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
});
export type ExtractedVet = z.infer<typeof ExtractedVetSchema>;

const ExtractionSchema = z.object({ vets: z.array(ExtractedVetSchema) });

const SYSTEM = `You read a pet's medical records (vet visits, recording transcripts, notes) and extract the VETERINARIANS and specialists who are part of the pet's care team.

Rules:
- Return ONE entry per distinct human vet/specialist. A clinic or hospital is NOT a team member on its own — attach it to the vet as "clinic". If a clinic is named with no person, skip it.
- "role" = their specialty or function as it appears (e.g. "Endocrinologista", "Cirurgião", "Clínico geral", "Cardiologista"). Infer it from context when clear; otherwise null.
- Capture phone/email only if they explicitly appear in the records. Never invent contact details.
- "notes" = a SHORT phrase on what they handle for this pet, if the records make it clear (e.g. "acompanha a investigação de Addison"). Otherwise null.
- Do NOT include people who are not vets (the owner, family).
- Write the string values in the SAME language as the records.
- You will be given a list of names ALREADY on the team — do not return those again.

Return ONLY a single fenced JSON code block:
\`\`\`json
{ "vets": [ { "name": string, "role": string|null, "clinic": string|null, "phone": string|null, "email": string|null, "notes": string|null } ] }
\`\`\`
If you find no new vets, return { "vets": [] }. Nothing outside the JSON block.`;

function stripFence(text: string): string {
	const full =
		text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/```\s*([\s\S]*?)```/);
	if (full) return full[1].trim();
	return text
		.trim()
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/```\s*$/i, "")
		.trim();
}

export async function extractVetTeam(
	env: Env,
	input: { sourceText: string; existingNames: string[] },
): Promise<ExtractedVet[]> {
	const existing =
		input.existingNames.length > 0
			? `Already on the team (do NOT return these): ${input.existingNames.join(", ")}.`
			: "The team is currently empty.";

	const res = await anthropicMessages(env, {
		model: "claude-opus-4-7",
		max_tokens: 1500,
		system: SYSTEM,
		messages: [
			{
				role: "user",
				content: `${existing}\n\nRecords:\n${input.sourceText}`,
			},
		],
	});
	const text = res.content.find((c) => c.type === "text")?.text ?? "";
	let parsed: unknown;
	try {
		parsed = JSON.parse(stripFence(text));
	} catch {
		return [];
	}
	const result = ExtractionSchema.safeParse(parsed);
	return result.success ? result.data.vets : [];
}
