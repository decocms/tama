import { z } from "zod";
import type { Env } from "../env.ts";
import { anthropicMessages } from "./gateway.ts";

// Looks at an uploaded document/photo (or pasted text) and decides what kind
// of timeline entry it should become, extracting the structured fields for
// the simple kinds inline. Lab reports are routed to the dedicated exam
// extractor (richer parsing) rather than handled here.

const ClassificationSchema = z.object({
	kind: z.enum(["exam", "vaccine", "vet_visit", "note"]),
	vaccine: z
		.object({
			name: z.string(),
			administeredAt: z.string().optional().nullable(),
			dueAt: z.string().optional().nullable(),
			lot: z.string().optional().nullable(),
			vetName: z.string().optional().nullable(),
		})
		.optional()
		.nullable(),
	vetVisit: z
		.object({
			visitedAt: z.string().optional().nullable(),
			vetName: z.string().optional().nullable(),
			clinic: z.string().optional().nullable(),
			reason: z.string().optional().nullable(),
			notes: z.string().optional().nullable(),
		})
		.optional()
		.nullable(),
	noteSummary: z.string().optional().nullable(),
});

export type AssetClassification = z.infer<typeof ClassificationSchema>;

const SYSTEM_PROMPT = `You triage an uploaded pet document/photo (or pasted text) into ONE timeline entry kind.

Decide "kind":
- "exam" — a lab report / blood work / urinalysis / any results with measured parameters. (Do NOT extract metrics; another tool does that.)
- "vaccine" — a vaccination certificate or record. Fill the "vaccine" object (name required; administeredAt/dueAt as ISO dates if printed; lot, vetName).
- "vet_visit" — a consultation note, discharge summary, invoice, or exam-room report. Fill "vetVisit" (visitedAt ISO if printed; vetName, clinic, reason, notes — a 1-2 sentence gist).
- "note" — anything else (a photo of the pet, a hand-written note, misc). Put a one-line description in "noteSummary".

Return ONLY a single fenced JSON code block. Include only the sub-object matching the chosen kind. Use ISO 8601 for dates; omit a date you can't read rather than guessing.`;

function stripJsonFence(text: string): string {
	const fenced = text.match(/```json\s*([\s\S]*?)```/);
	if (fenced) return fenced[1].trim();
	const generic = text.match(/```\s*([\s\S]*?)```/);
	if (generic) return generic[1].trim();
	return text.trim();
}

export interface ClassifyInput {
	imageBase64?: string;
	mimeType?: string;
	text?: string;
}

export async function classifyAsset(
	env: Env,
	input: ClassifyInput,
): Promise<AssetClassification> {
	const isPdf = input.mimeType === "application/pdf";
	const sourceBlock =
		input.imageBase64 && input.mimeType
			? isPdf
				? {
						type: "document" as const,
						source: {
							type: "base64" as const,
							media_type: "application/pdf" as const,
							data: input.imageBase64,
						},
					}
				: {
						type: "image" as const,
						source: {
							type: "base64" as const,
							media_type: input.mimeType,
							data: input.imageBase64,
						},
					}
			: null;

	const userText = input.text
		? `Classify this pet document:\n\n${input.text}`
		: "Classify this uploaded pet document.";

	const res = await anthropicMessages(env, {
		model: "claude-opus-4-7",
		max_tokens: 1024,
		system: SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content: sourceBlock
					? [sourceBlock, { type: "text", text: userText }]
					: userText,
			},
		],
	});
	const text = res.content.find((c) => c.type === "text")?.text ?? "";
	return ClassificationSchema.parse(JSON.parse(stripJsonFence(text)));
}
