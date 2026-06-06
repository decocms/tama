import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { explainExams } from "../ai/explain-exams.ts";
import { extractExam } from "../ai/extract-exam.ts";
import { petContextBlock } from "../ai/pet-context.ts";
import type { Env } from "../env.ts";
import { saveFile } from "../storage/files.ts";
import { getSelfPet } from "../storage/pet-self.ts";
import { parseProfile } from "../storage/pets.ts";
import {
	createExamDraft,
	deleteExam,
	type ExamMetricInput,
	type ExamWithMetrics,
	getExamWithMetrics,
	getMetricSeriesForPet,
	listExamsForPet,
	updateExam,
} from "../storage/exams.ts";

const MetricStatusEnum = z.enum([
	"normal",
	"low",
	"high",
	"abnormal",
	"unknown",
]);

const ExamMetricSchema = z.object({
	id: z.string(),
	examId: z.string(),
	canonicalKey: z.string().nullable(),
	displayName: z.string(),
	valueNum: z.number().nullable(),
	valueText: z.string().nullable(),
	unit: z.string().nullable(),
	refLow: z.number().nullable(),
	refHigh: z.number().nullable(),
	refText: z.string().nullable(),
	status: MetricStatusEnum,
	pendingReview: z.boolean(),
	createdAt: z.string(),
});

const ExamSchema = z.object({
	id: z.string(),
	petId: z.string(),
	fileId: z.string().nullable(),
	status: z.enum(["draft", "confirmed"]),
	performedAt: z.string().nullable(),
	labName: z.string().nullable(),
	requestId: z.string().nullable(),
	rawAiText: z.string().nullable(),
	sourceNotes: z.string().nullable(),
	createdAt: z.string(),
});

const ExamWithMetricsSchema = z.object({
	exam: ExamSchema,
	metrics: z.array(ExamMetricSchema),
});

const MetricInputSchema = z.object({
	canonicalKey: z.string().nullable(),
	displayName: z.string().min(1),
	valueNum: z.number().nullable().optional(),
	valueText: z.string().nullable().optional(),
	unit: z.string().nullable().optional(),
	refLow: z.number().nullable().optional(),
	refHigh: z.number().nullable().optional(),
	refText: z.string().nullable().optional(),
	status: MetricStatusEnum.optional(),
	pendingReview: z.boolean().optional(),
});

function pendingReviewCount(payload: ExamWithMetrics): number {
	return payload.metrics.filter((m) => m.pendingReview).length;
}

export const examUploadTool = (_env: Env) =>
	createTool({
		id: "exam_upload",
		description: `Upload a lab report (PDF or image) and let the vision model extract every parameter. Saves the file in R2 (so the original document stays linked to the episode), runs Claude vision/document extraction, returns a DRAFT exam with structured metrics. The owner then reviews and confirms the exam in the UI.

Use this when you actually have a file to OCR. If you already have the lab values as text (pasted email, screenshot text, etc.), call exam_paste instead — same extractor, no file storage round-trip.

Accepted formats: image/jpeg, image/png, image/webp, image/gif, application/pdf.`,
		inputSchema: z.object({
			imageBase64: z.string(),
			mimeType: z.string(),
			originalName: z.string().optional(),
			sourceNotes: z.string().optional(),
		}),
		outputSchema: z.object({
			exam: ExamSchema,
			metrics: z.array(ExamMetricSchema),
			pendingReviewCount: z.number(),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const file = await saveFile(env, {
				base64: context.imageBase64,
				mimeType: context.mimeType,
				originalName: context.originalName,
				kind: "exam",
			});
			const extracted = await extractExam(env, {
				imageBase64: context.imageBase64,
				mimeType: context.mimeType,
				sourceNotes: context.sourceNotes,
			});
			const result = await createExamDraft(env, {
				fileId: file.id,
				performedAt: extracted.exam.performedAt ?? null,
				labName: extracted.exam.labName ?? null,
				requestId: extracted.exam.requestId ?? null,
				metrics: extracted.metrics.map(toInputMetric),
				rawAiText: extracted.rawAiText,
				sourceNotes: context.sourceNotes,
				status: "draft",
			});
			return {
				exam: result.exam,
				metrics: result.metrics,
				pendingReviewCount: pendingReviewCount(result),
			};
		},
	});

export const examPasteTool = (_env: Env) =>
	createTool({
		id: "exam_paste",
		description: `Extract lab parameters from a pasted block of raw text (email body, OCR'd transcript, screenshot text). Same extractor as exam_upload, no file is stored. Returns a DRAFT exam with structured metrics for owner review.`,
		inputSchema: z.object({
			text: z.string().min(20),
			sourceNotes: z.string().optional(),
		}),
		outputSchema: z.object({
			exam: ExamSchema,
			metrics: z.array(ExamMetricSchema),
			pendingReviewCount: z.number(),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const extracted = await extractExam(env, {
				text: context.text,
				sourceNotes: context.sourceNotes,
			});
			const result = await createExamDraft(env, {
				fileId: null,
				performedAt: extracted.exam.performedAt ?? null,
				labName: extracted.exam.labName ?? null,
				requestId: extracted.exam.requestId ?? null,
				metrics: extracted.metrics.map(toInputMetric),
				rawAiText: extracted.rawAiText,
				sourceNotes: context.sourceNotes,
				status: "draft",
			});
			return {
				exam: result.exam,
				metrics: result.metrics,
				pendingReviewCount: pendingReviewCount(result),
			};
		},
	});

export const examUpdateTool = (_env: Env) =>
	createTool({
		id: "exam_update",
		description:
			"Update an exam's header fields and/or its full metric list. Set status='confirmed' to expose the exam in charts. Replacing metrics is atomic — pass the full desired array.",
		inputSchema: z.object({
			examId: z.string(),
			performedAt: z.string().nullable().optional(),
			labName: z.string().nullable().optional(),
			requestId: z.string().nullable().optional(),
			sourceNotes: z.string().nullable().optional(),
			status: z.enum(["draft", "confirmed"]).optional(),
			metrics: z.array(MetricInputSchema).optional(),
		}),
		outputSchema: z.object({
			exam: ExamSchema.nullable(),
			metrics: z.array(ExamMetricSchema),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const result = await updateExam(env, {
				id: context.examId,
				performedAt: context.performedAt,
				labName: context.labName,
				requestId: context.requestId,
				sourceNotes: context.sourceNotes,
				status: context.status,
				metrics: context.metrics as ExamMetricInput[] | undefined,
			});
			return {
				exam: result?.exam ?? null,
				metrics: result?.metrics ?? [],
			};
		},
	});

export const examDeleteTool = (_env: Env) =>
	createTool({
		id: "exam_delete",
		description:
			"Delete an exam. Metrics cascade. The file in R2 is left in place (referenced by file row with set null FK).",
		inputSchema: z.object({ examId: z.string() }),
		outputSchema: z.object({ deleted: z.boolean() }),
		execute: async ({ context, runtimeContext }) => {
			return deleteExam(runtimeContext.env as Env, context.examId);
		},
	});

export const examGetTool = (_env: Env) =>
	createTool({
		id: "exam_get",
		description: "Fetch a single exam with all its metrics.",
		inputSchema: z.object({ examId: z.string() }),
		outputSchema: z.object({
			exam: ExamSchema.nullable(),
			metrics: z.array(ExamMetricSchema),
		}),
		annotations: { readOnlyHint: true },
		execute: async ({ context, runtimeContext }) => {
			const result = await getExamWithMetrics(
				runtimeContext.env as Env,
				context.examId,
			);
			return {
				exam: result?.exam ?? null,
				metrics: result?.metrics ?? [],
			};
		},
	});

export const examListTool = (_env: Env) =>
	createTool({
		id: "exam_list",
		description: "List every exam this pet has ever had.",
		inputSchema: z.object({}),
		outputSchema: z.object({ exams: z.array(ExamSchema) }),
		annotations: { readOnlyHint: true },
		execute: async ({ runtimeContext }) => {
			const env = runtimeContext.env as Env;
			return { exams: await listExamsForPet(env) };
		},
	});

export const examMetricSeriesTool = (_env: Env) =>
	createTool({
		id: "exam_metric_series",
		description:
			"Time-series points for the evolution chart. Optionally filter to specific canonical metric keys (e.g. ['hemoglobin','albumin']). Returns every confirmed exam's value for those metrics, ordered chronologically. Omit canonicalKeys to get every metric ever recorded.",
		inputSchema: z.object({
			canonicalKeys: z.array(z.string()).optional(),
		}),
		outputSchema: z.object({
			series: z.array(
				z.object({
					canonicalKey: z.string(),
					performedAt: z.string(),
					valueNum: z.number().nullable(),
					valueText: z.string().nullable(),
					unit: z.string().nullable(),
					refLow: z.number().nullable(),
					refHigh: z.number().nullable(),
					refText: z.string().nullable(),
					status: MetricStatusEnum,
					examId: z.string(),
					displayName: z.string(),
				}),
			),
		}),
		annotations: { readOnlyHint: true },
		execute: async ({ context, runtimeContext }) => {
			const series = await getMetricSeriesForPet(
				runtimeContext.env as Env,
				context.canonicalKeys,
			);
			return { series };
		},
	});

export const examExplainTool = (_env: Env) =>
	createTool({
		id: "exam_explain",
		description:
			"Explain the pet's lab trends in plain language, grounded in the pet's case file. Returns a short owner-friendly briefing grouped by body system (blood count, liver, kidney, …) — what moved, what's reassuring, what to watch — ending in a bottom line that defers to the vet. Pass canonicalKeys to explain only a chosen subset (the detail view does this); omit to cover every confirmed metric. Used by the 'Explain with AI' button.",
		inputSchema: z.object({
			canonicalKeys: z
				.array(z.string())
				.optional()
				.describe("Only explain these metrics. Omit for all confirmed metrics."),
		}),
		outputSchema: z.object({ insights: z.string() }),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const [series, pet] = await Promise.all([
				getMetricSeriesForPet(env, context.canonicalKeys),
				getSelfPet(env),
			]);
			const petContext = pet
				? petContextBlock(pet, parseProfile(pet))
				: "Unknown pet.";
			const insights = await explainExams(env, { petContext, series });
			return { insights };
		},
	});

function toInputMetric(m: {
	canonicalKey: string;
	proposed?: boolean;
	displayName: string;
	valueNum?: number | null;
	valueText?: string | null;
	unit?: string | null;
	refLow?: number | null;
	refHigh?: number | null;
	refText?: string | null;
	status?: "normal" | "low" | "high" | "abnormal" | "unknown";
}): ExamMetricInput {
	return {
		canonicalKey: m.canonicalKey,
		displayName: m.displayName,
		valueNum: m.valueNum ?? null,
		valueText: m.valueText ?? null,
		unit: m.unit ?? null,
		refLow: m.refLow ?? null,
		refHigh: m.refHigh ?? null,
		refText: m.refText ?? null,
		status: m.status ?? "unknown",
		pendingReview: m.proposed === true,
	};
}

export {
	ExamMetricSchema as ExamMetricToolSchema,
	ExamSchema as ExamToolSchema,
};
