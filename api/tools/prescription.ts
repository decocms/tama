import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { extractPrescription } from "../ai/extract-prescription.ts";
import type { Env } from "../env.ts";
import { saveFile } from "../storage/files.ts";
import {
	createPrescription,
	listPrescriptions,
	parseScheduleItems,
	updatePrescription,
} from "../storage/prescriptions.ts";
import { type ScheduleItem, ScheduleItemSchema } from "./shared.ts";
import { URI } from "./uris.ts";

export const PRESCRIPTION_REVIEW_URI = URI.prescriptionReview;

const PrescriptionSchema = z.object({
	id: z.string(),
	episodeId: z.string(),
	fileId: z.string().nullable(),
	status: z.enum(["draft", "confirmed"]),
	scheduleItems: z.array(ScheduleItemSchema),
	rawAiText: z.string().nullable(),
	sourceNotes: z.string().nullable(),
	createdAt: z.string(),
});

function toRx(r: {
	id: string;
	episodeId: string;
	fileId: string | null;
	status: "draft" | "confirmed";
	scheduleItemsJson: string;
	rawAiText: string | null;
	sourceNotes: string | null;
	createdAt: string;
}) {
	return {
		id: r.id,
		episodeId: r.episodeId,
		fileId: r.fileId,
		status: r.status,
		scheduleItems: parseScheduleItems(r as never),
		rawAiText: r.rawAiText,
		sourceNotes: r.sourceNotes,
		createdAt: r.createdAt,
	};
}

export const prescriptionUploadTool = (_env: Env) =>
	createTool({
		id: "prescription_upload",
		description:
			"Upload a prescription image (or any photo describing scheduled care — meds and meals). Stores the file in R2, runs AI vision extraction, returns a draft prescription with extracted ScheduleItems for review.",
		inputSchema: z.object({
			episodeId: z.string(),
			imageBase64: z
				.string()
				.describe("Base64-encoded file bytes (data URI prefix optional)"),
			mimeType: z
				.string()
				.describe("e.g. image/jpeg, image/png, application/pdf"),
			originalName: z.string().optional(),
			sourceNotes: z
				.string()
				.optional()
				.describe(
					"Free-text context the owner wants to attach (vet instructions, when first dose was given, etc.)",
				),
		}),
		outputSchema: z.object({ prescription: PrescriptionSchema }),
		_meta: { ui: { resourceUri: PRESCRIPTION_REVIEW_URI } },
		execute: async ({ context, runtimeContext }) => {
			const e = runtimeContext.env as Env;
			const file = await saveFile(e, {
				base64: context.imageBase64,
				mimeType: context.mimeType,
				originalName: context.originalName,
				kind: "prescription",
			});
			const extracted = await extractPrescription(e, {
				imageBase64: context.imageBase64,
				mimeType: context.mimeType,
				sourceNotes: context.sourceNotes,
			});
			const rx = await createPrescription(e, {
				episodeId: context.episodeId,
				fileId: file.id,
				scheduleItems: extracted.items,
				rawAiText: extracted.rawAiText,
				sourceNotes: context.sourceNotes,
				status: "draft",
			});
			return { prescription: toRx(rx) };
		},
	});

export const prescriptionUpdateTool = (_env: Env) =>
	createTool({
		id: "prescription_update",
		description:
			"Update a draft prescription's schedule items, source notes, or confirm it. Confirming makes it appear on the timetable.",
		inputSchema: z.object({
			prescriptionId: z.string(),
			scheduleItems: z.array(ScheduleItemSchema).optional(),
			status: z.enum(["draft", "confirmed"]).optional(),
			sourceNotes: z.string().optional(),
		}),
		outputSchema: z.object({ prescription: PrescriptionSchema.nullable() }),
		execute: async ({ context, runtimeContext }) => {
			const updated = await updatePrescription(runtimeContext.env as Env, {
				id: context.prescriptionId,
				scheduleItems: context.scheduleItems as ScheduleItem[] | undefined,
				status: context.status,
				sourceNotes: context.sourceNotes,
			});
			return { prescription: updated ? toRx(updated) : null };
		},
	});

export const prescriptionListTool = (_env: Env) =>
	createTool({
		id: "prescription_list",
		description: "List prescriptions for an episode.",
		inputSchema: z.object({ episodeId: z.string() }),
		outputSchema: z.object({ prescriptions: z.array(PrescriptionSchema) }),
		_meta: { ui: { resourceUri: URI.prescriptionList } },
		annotations: { readOnlyHint: true },
		execute: async ({ context, runtimeContext }) => {
			const rows = await listPrescriptions(
				runtimeContext.env as Env,
				context.episodeId,
			);
			return { prescriptions: rows.map((r) => toRx(r)) };
		},
	});
