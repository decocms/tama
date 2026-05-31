import { z } from "zod";
import type { Env } from "../env.ts";
import { TAXONOMY_BY_KEY, taxonomyForPrompt } from "../lab/taxonomy.ts";
import { anthropicMessages } from "./gateway.ts";

const SYSTEM_PROMPT = `You are a veterinary lab-report extractor. Your job is to read a lab report (image, PDF, or pasted text) and emit a structured JSON payload.

You will receive a TAXONOMY of canonical metric keys. Map every measured parameter to one of these keys when possible by matching against \`key\`, \`label\`, or any of the \`synonyms\` (case-insensitive, Portuguese OR English, common abbreviations OK).

If a parameter is not in the taxonomy, propose a new \`canonicalKey\` in snake_case (e.g. "alpha_2_globulin"), and set \`proposed: true\` for that metric.

Output rules:
- Return ONLY a single fenced JSON code block (\`\`\`json ... \`\`\`).
- Top-level shape: { "exam": { "performedAt", "labName", "requestId" }, "metrics": [ ... ] }
- exam.performedAt: ISO 8601 string for the date the sample was collected (or report date if collection date isn't printed). Best-effort.
- exam.labName: the laboratory's name (e.g. "IEMEV Botafogo", "E+LAB").
- exam.requestId: any request/order/pedido number printed on the report.
- Each metric:
  - canonicalKey: a key from the taxonomy when possible; otherwise a snake_case proposal.
  - proposed: true only when canonicalKey is NOT in the taxonomy. Omit or false otherwise.
  - displayName: the parameter name AS PRINTED on the report (preserve language and case).
  - valueNum: the numeric value when parseable (a real number). Omit when the value is qualitative.
  - valueText: ONLY when the value is non-numeric (e.g. "Reagente", "< 50", "negative") or when valueNum is omitted. NEVER set both valueNum and valueText.
  - unit: the unit as printed.
  - refLow / refHigh: numeric reference range bounds when the lab prints both. Omit when not printed or not numeric.
  - refText: the original reference-range string ("[ref 4–66]", "< 50", "negative"). Always include the printed range when there is one.
  - status: one of "normal" | "low" | "high" | "abnormal" | "unknown". Decide based on value vs. range. Use "abnormal" when value is qualitative but flagged. Use "unknown" when either side is missing.
- Do NOT invent parameters. If a row is illegible, skip it.
- Do NOT include test-method headers or section titles as metrics.

Return nothing outside the JSON block.`;

const ExtractedMetricSchema = z.object({
	canonicalKey: z.string().min(1),
	proposed: z.boolean().optional(),
	displayName: z.string().min(1),
	valueNum: z.number().optional().nullable(),
	valueText: z.string().optional().nullable(),
	unit: z.string().optional().nullable(),
	refLow: z.number().optional().nullable(),
	refHigh: z.number().optional().nullable(),
	refText: z.string().optional().nullable(),
	status: z.enum(["normal", "low", "high", "abnormal", "unknown"]).default("unknown"),
});

const ExtractedExamSchema = z.object({
	exam: z.object({
		performedAt: z.string().optional().nullable(),
		labName: z.string().optional().nullable(),
		requestId: z.string().optional().nullable(),
	}),
	metrics: z.array(ExtractedMetricSchema),
});

export type ExtractedMetric = z.infer<typeof ExtractedMetricSchema>;
export type ExtractedExam = z.infer<typeof ExtractedExamSchema>;

export interface ExtractExamInput {
	imageBase64?: string;
	mimeType?: string;
	text?: string;
	sourceNotes?: string;
}

export interface ExtractExamOutput {
	exam: ExtractedExam["exam"];
	metrics: ExtractedMetric[];
	rawAiText: string;
}

function stripJsonFence(text: string): string {
	const fenced = text.match(/```json\s*([\s\S]*?)```/);
	if (fenced) return fenced[1].trim();
	const generic = text.match(/```\s*([\s\S]*?)```/);
	if (generic) return generic[1].trim();
	return text.trim();
}

// Flag metrics whose canonicalKey isn't in the taxonomy. We trust the LLM's
// `proposed` hint when present, but also double-check against TAXONOMY_BY_KEY
// since some prompts will return proposed=false for a typo.
export function annotatePendingReview(
	metrics: ExtractedMetric[],
): ExtractedMetric[] {
	return metrics.map((m) => {
		const isKnown = !!TAXONOMY_BY_KEY[m.canonicalKey];
		return { ...m, proposed: m.proposed === true ? true : !isKnown };
	});
}

export async function extractExam(
	env: Env,
	input: ExtractExamInput,
): Promise<ExtractExamOutput> {
	const taxonomy = taxonomyForPrompt();
	const userIntro = input.sourceNotes
		? `Owner-provided context: ${input.sourceNotes}\n\nExtract every lab parameter from the document below.`
		: "Extract every lab parameter from the document below.";

	// Three input modes: PDF (document block), image (image block), or plain
	// text (paste mode). Anthropic returns 400 if you send a PDF as an image
	// block, so we dispatch on mime type just like the prescription extractor.
	const isPdf = input.mimeType === "application/pdf";
	const sourceBlock = (() => {
		if (input.text != null && input.text.length > 0) {
			return null; // text-only path; user content is the prose
		}
		if (!input.imageBase64 || !input.mimeType) {
			throw new Error(
				"extractExam: either {imageBase64,mimeType} or {text} must be provided",
			);
		}
		if (isPdf) {
			return {
				type: "document" as const,
				source: {
					type: "base64" as const,
					media_type: "application/pdf" as const,
					data: input.imageBase64,
				},
			};
		}
		return {
			type: "image" as const,
			source: {
				type: "base64" as const,
				media_type: input.mimeType,
				data: input.imageBase64,
			},
		};
	})();

	const userText = input.text
		? `${userIntro}\n\nTAXONOMY:\n${taxonomy}\n\nLAB REPORT TEXT:\n${input.text}`
		: `${userIntro}\n\nTAXONOMY:\n${taxonomy}`;

	const call = (priorErr?: string) =>
		anthropicMessages(env, {
			model: "claude-opus-4-7",
			max_tokens: 4096,
			system: SYSTEM_PROMPT,
			messages: [
				{
					role: "user",
					content: sourceBlock
						? [
								sourceBlock,
								{
									type: "text",
									text: priorErr
										? `${userText}\n\nThe previous response failed to parse with: ${priorErr}\nReturn a valid JSON code block this time.`
										: userText,
								},
							]
						: [
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

	const tryParse = (text: string): ExtractedExam => {
		const json = stripJsonFence(text);
		const parsed = JSON.parse(json);
		return ExtractedExamSchema.parse(parsed);
	};

	const first = await call();
	const firstText = first.content.find((c) => c.type === "text")?.text ?? "";

	let result: ExtractedExam;
	let rawAiText = firstText;
	try {
		result = tryParse(firstText);
	} catch (err) {
		const retry = await call((err as Error).message);
		const retryText = retry.content.find((c) => c.type === "text")?.text ?? "";
		result = tryParse(retryText);
		rawAiText = retryText;
	}

	return {
		exam: result.exam,
		metrics: annotatePendingReview(result.metrics),
		rawAiText,
	};
}
