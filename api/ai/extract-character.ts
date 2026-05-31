import { z } from "zod";
import type { Env } from "../env.ts";
import { anthropicMessages } from "./gateway.ts";

// Pass 1a of the sprite pipeline: a vision LLM examines the source photo
// and emits a structured "character sheet" that the img2img passes consume.
// We don't trust the image model to reverse-engineer breed shape from a
// photo on its own — passing structured hints in the prompt holds the
// design steady across the 6 expression variants.

const CharacterSheetSchema = z.object({
	species: z.string().min(1),
	breed: z.string().optional().nullable(),
	primaryColor: z.string().min(1),
	secondaryColor: z.string().optional().nullable(),
	earShape: z.enum(["floppy", "pointy", "folded", "round", "tufted", "unknown"]),
	markings: z.array(z.string()).default([]),
	headShape: z.string().optional().nullable(),
	eyeColor: z.string().optional().nullable(),
	distinctiveFeatures: z.array(z.string()).default([]),
});

export type CharacterSheet = z.infer<typeof CharacterSheetSchema>;

const SYSTEM_PROMPT = `You are a character designer translating a real pet photo into a structured "character sheet" for a pixel-art sprite generator. Look at the photo and extract identity-defining traits.

Return ONLY a single fenced JSON code block (\`\`\`json ... \`\`\`). Required fields:
- species: e.g. "dog", "cat", "rabbit"
- breed: best guess if visible, else null
- primaryColor: the dominant fur/coat color in plain English ("cream tan", "black and white", "ginger")
- secondaryColor: any clear second color, else null
- earShape: one of "floppy" | "pointy" | "folded" | "round" | "tufted" | "unknown"
- markings: array of short phrases describing distinguishing patches/patterns ("white blaze across muzzle", "black mask around eyes", "white tip on tail"). Empty array if none.
- headShape: short description ("round and compact", "long and narrow", "boxy")
- eyeColor: if visible
- distinctiveFeatures: anything else memorable that would help recognize this individual ("oversized ears for body", "fluffy mane")

Be concise; each value 1-6 words. Do NOT include personality assessments — only physical, sprite-relevant traits.

Return nothing outside the JSON block.`;

function stripJsonFence(text: string): string {
	const fenced = text.match(/```json\s*([\s\S]*?)```/);
	if (fenced) return fenced[1].trim();
	const generic = text.match(/```\s*([\s\S]*?)```/);
	if (generic) return generic[1].trim();
	return text.trim();
}

export async function extractCharacterSheet(
	env: Env,
	input: { imageBase64: string; mimeType: string },
): Promise<CharacterSheet> {
	const isPdf = input.mimeType === "application/pdf";
	if (isPdf) {
		throw new Error(
			"extractCharacterSheet: photos only, not PDFs (the photo of the pet)",
		);
	}

	const call = (priorErr?: string) =>
		anthropicMessages(env, {
			model: "claude-opus-4-7",
			max_tokens: 1024,
			system: SYSTEM_PROMPT,
			messages: [
				{
					role: "user",
					content: [
						{
							type: "image",
							source: {
								type: "base64",
								media_type: input.mimeType,
								data: input.imageBase64,
							},
						},
						{
							type: "text",
							text: priorErr
								? `Describe the pet for the sprite generator. Your previous JSON failed to parse with: ${priorErr}. Return a valid JSON code block this time.`
								: "Describe the pet in the photo for the sprite generator.",
						},
					],
				},
			],
		});

	const tryParse = (text: string): CharacterSheet => {
		const json = stripJsonFence(text);
		const parsed = JSON.parse(json);
		return CharacterSheetSchema.parse(parsed);
	};

	const first = await call();
	const firstText = first.content.find((c) => c.type === "text")?.text ?? "";
	try {
		return tryParse(firstText);
	} catch (err) {
		const retry = await call((err as Error).message);
		const retryText = retry.content.find((c) => c.type === "text")?.text ?? "";
		return tryParse(retryText);
	}
}

// Synthesize the part of the img2img prompt that describes the creature's
// look. Used by both the base pass and the expression-variant pass.
export function characterPromptFragment(c: CharacterSheet): string {
	const parts: string[] = [];
	parts.push(c.species);
	if (c.breed) parts.push(`(${c.breed})`);
	parts.push(`with ${c.primaryColor} fur`);
	if (c.secondaryColor) parts.push(`and ${c.secondaryColor} accents`);
	if (c.earShape && c.earShape !== "unknown") parts.push(`${c.earShape} ears`);
	if (c.markings.length > 0) parts.push(c.markings.join(", "));
	if (c.headShape) parts.push(`${c.headShape} head`);
	return parts.join(", ");
}
