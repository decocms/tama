import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { classifyAsset } from "../ai/classify-asset.ts";
import { extractExam } from "../ai/extract-exam.ts";
import type { Env } from "../env.ts";
import {
	createExamDraft,
	type ExamMetricInput,
} from "../storage/exams.ts";
import { listAssetFiles, saveFile } from "../storage/files.ts";
import type { FileRow } from "../db/schema.ts";
import { addNote } from "../storage/timeline.ts";
import { addVaccine } from "../storage/vaccines.ts";
import { addVetVisit } from "../storage/vet-visits.ts";

// The Assets intake. Drop ANY document/photo/text → it's stored in R2 (the
// durable Assets record) and an AI classifier routes it into the right
// timeline entry: a lab exam, a vaccine, a vet visit, or a general note.

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

export const assetUploadTool = (_env: Env) =>
	createTool({
		id: "asset_upload",
		description: `Upload ANY document, photo, or pasted text about the pet. It's saved to the Assets library and an AI classifier files it into the timeline automatically:
  • lab report → a structured exam (metrics + charts)
  • vaccine certificate → a vaccine entry
  • vet note / discharge / invoice → a vet visit
  • anything else → a general timeline note

Pass a file (imageBase64 + mimeType) OR text. Returns what it became.`,
		inputSchema: z.object({
			imageBase64: z.string().optional(),
			mimeType: z.string().optional(),
			text: z.string().optional(),
			originalName: z.string().optional(),
		}),
		outputSchema: z.object({
			assetType: z.enum(["exam", "vaccine", "vet_visit", "note"]),
			refId: z.string(),
			fileId: z.string().nullable(),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;

			// 1. Persist the raw file (if binary) — the durable Assets record.
			let file: FileRow | null = null;
			if (context.imageBase64 && context.mimeType) {
				file = await saveFile(env, {
					base64: context.imageBase64,
					mimeType: context.mimeType,
					originalName: context.originalName,
					kind: "other",
				});
			}

			// 2. Classify.
			const cls = await classifyAsset(env, {
				imageBase64: context.imageBase64,
				mimeType: context.mimeType,
				text: context.text,
			});

			// 3. Dispatch into the right timeline entry.
			if (cls.kind === "exam") {
				const extracted = await extractExam(env, {
					imageBase64: context.imageBase64,
					mimeType: context.mimeType,
					text: context.text,
				});
				const result = await createExamDraft(env, {
					fileId: file?.id ?? null,
					performedAt: extracted.exam.performedAt ?? null,
					labName: extracted.exam.labName ?? null,
					requestId: extracted.exam.requestId ?? null,
					metrics: extracted.metrics.map(toInputMetric),
					rawAiText: extracted.rawAiText,
					status: "draft",
				});
				return {
					assetType: "exam" as const,
					refId: result.exam.id,
					fileId: file?.id ?? null,
				};
			}

			if (cls.kind === "vaccine" && cls.vaccine) {
				const v = await addVaccine(env, {
					name: cls.vaccine.name,
					administeredAt: cls.vaccine.administeredAt ?? undefined,
					dueAt: cls.vaccine.dueAt ?? undefined,
					lot: cls.vaccine.lot ?? undefined,
					vetName: cls.vaccine.vetName ?? undefined,
					fileId: file?.id ?? null,
				});
				return {
					assetType: "vaccine" as const,
					refId: v.id,
					fileId: file?.id ?? null,
				};
			}

			if (cls.kind === "vet_visit" && cls.vetVisit) {
				const v = await addVetVisit(env, {
					visitedAt: cls.vetVisit.visitedAt ?? undefined,
					vetName: cls.vetVisit.vetName ?? undefined,
					clinic: cls.vetVisit.clinic ?? undefined,
					reason: cls.vetVisit.reason ?? undefined,
					notes: cls.vetVisit.notes ?? undefined,
					fileId: file?.id ?? null,
				});
				return {
					assetType: "vet_visit" as const,
					refId: v.id,
					fileId: file?.id ?? null,
				};
			}

			// Fallback: a general note.
			const note = await addNote(env, {
				kind: "general",
				content:
					cls.noteSummary ??
					context.text ??
					context.originalName ??
					"Uploaded asset",
			});
			return {
				assetType: "note" as const,
				refId: note.id,
				fileId: file?.id ?? null,
			};
		},
	});

export const assetListTool = (_env: Env) =>
	createTool({
		id: "asset_list",
		description:
			"List the uploaded files in the Assets library (newest first), with the kind tag and original name. Recording chunks are excluded — they're transcription internals, not documents.",
		inputSchema: z.object({}),
		outputSchema: z.object({
			assets: z.array(
				z.object({
					id: z.string(),
					originalName: z.string().nullable(),
					mimeType: z.string(),
					kind: z.string(),
					uploadedAt: z.string(),
				}),
			),
		}),
		annotations: { readOnlyHint: true },
		execute: async ({ runtimeContext }) => {
			const files = await listAssetFiles(runtimeContext.env as Env);
			return {
				assets: files.map((f) => ({
					id: f.id,
					originalName: f.originalName,
					mimeType: f.mimeType,
					kind: f.kind,
					uploadedAt: f.uploadedAt,
				})),
			};
		},
	});
