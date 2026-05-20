import type { Env } from "../env.ts";
import { type ScheduleItem, ScheduleItemsSchema } from "../tools/shared.ts";
import { anthropicMessages } from "./gateway.ts";

const SYSTEM_PROMPT = `You are a veterinary scheduling assistant. Extract every scheduled item (medications AND meals) from the image of a prescription/whiteboard/handwritten note.

Output rules:
- Return ONLY a single fenced JSON code block (\`\`\`json ... \`\`\`) containing an array of items.
- Each item: { name, kind, dosage?, route?, times, frequencyHours?, durationDays?, notes? }
- "kind" is "meal" for food-related items (papa, papinha, comida, ração, food, meal, refeição) — otherwise "medication".
- "times" is an array of HH:mm in 24-hour format. Convert any other format (e.g. "8:13" → "08:13"). Sort ascending.
- "name" is the label as it appears (preserve case and slashes, e.g. "PRELONE/B12").
- If a number/time is illegible or struck through, omit it. Do not invent times.
- Times that are written but then crossed out should be excluded.
- If the user provided extra context, use it to disambiguate but do NOT add items not present in the image.

Return nothing outside the JSON block.`;

export interface ExtractInput {
	imageBase64: string;
	mimeType: string;
	sourceNotes?: string;
}

export interface ExtractOutput {
	items: ScheduleItem[];
	rawAiText: string;
}

function stripJsonFence(text: string): string {
	const fenced = text.match(/```json\s*([\s\S]*?)```/);
	if (fenced) return fenced[1].trim();
	const generic = text.match(/```\s*([\s\S]*?)```/);
	if (generic) return generic[1].trim();
	return text.trim();
}

export async function extractPrescription(
	env: Env,
	input: ExtractInput,
): Promise<ExtractOutput> {
	const userText = input.sourceNotes
		? `Owner-provided context: ${input.sourceNotes}\n\nExtract all scheduled items from the document.`
		: "Extract all scheduled items from the document.";

	// Anthropic accepts images and PDFs via two different content block types.
	// Sending a PDF as an "image" block returns 400 "Could not process image",
	// which is what was killing the upload-PDF path. Dispatch on mime type.
	const isPdf = input.mimeType === "application/pdf";
	const sourceBlock = isPdf
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
			};

	const call = (priorErr?: string) =>
		anthropicMessages(env, {
			model: "claude-opus-4-7",
			max_tokens: 2048,
			system: SYSTEM_PROMPT,
			messages: [
				{
					role: "user",
					content: [
						sourceBlock,
						{
							type: "text",
							text: priorErr
								? `${userText}\n\nThe previous response failed to parse with: ${priorErr}\nReturn a valid JSON code block this time.`
								: userText,
						},
					],
				},
			],
		});

	const tryParse = (text: string): ScheduleItem[] => {
		const json = stripJsonFence(text);
		const parsed = JSON.parse(json);
		return ScheduleItemsSchema.parse(parsed);
	};

	const first = await call();
	const firstText = first.content.find((c) => c.type === "text")?.text ?? "";

	try {
		return { items: tryParse(firstText), rawAiText: firstText };
	} catch (err) {
		const retry = await call((err as Error).message);
		const retryText = retry.content.find((c) => c.type === "text")?.text ?? "";
		return { items: tryParse(retryText), rawAiText: retryText };
	}
}
