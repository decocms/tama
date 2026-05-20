import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { extractPrescription } from "../ai/extract-prescription.ts";
import type { Env } from "../env.ts";
import { getEpisode } from "../storage/episodes.ts";
import { saveFile } from "../storage/files.ts";
import { getPet } from "../storage/pets.ts";
import {
	createPrescription,
	listPrescriptions,
	parseScheduleItems,
	updatePrescription,
} from "../storage/prescriptions.ts";
import { syncPrescriptionToScheduleState } from "../storage/schedule-state.ts";
import { type ScheduleItem, ScheduleItemSchema } from "./shared.ts";
import { URI } from "./uris.ts";

async function syncRxIfConfirmed(
	env: Env,
	rx: {
		id: string;
		episodeId: string;
		status: "draft" | "confirmed";
		scheduleItemsJson: string;
		fileId: string | null;
		rawAiText: string | null;
		sourceNotes: string | null;
		createdAt: string;
	},
): Promise<void> {
	if (rx.status !== "confirmed") return;
	const ep = await getEpisode(env, rx.episodeId);
	if (!ep) return;
	const pet = await getPet(env, ep.petId);
	const tz = pet?.timezone ?? "UTC";
	await syncPrescriptionToScheduleState(env, rx as never, tz);
}

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
		description: `Upload a raw image OR PDF of a prescription and let the vision model extract the ScheduleItems for you. Stores the file in R2 (so the original document stays linked to the episode), runs Claude vision/document extraction, returns a draft prescription with the extracted items.

DO NOT use this when you already have the prescription content as structured/text data — in that case use prescription_create directly. This tool is wasted compute (and a failure point) when OCR isn't actually needed. Typical "already have the text" signals:
  • The platform inlined the PDF text into your conversation as a <document> block.
  • The user pasted/dictated the medication list in chat.
  • You parsed the items from another source.

Accepted formats: image/jpeg, image/png, image/webp, image/gif, application/pdf. The PDF path uses Anthropic's native document content blocks — multi-page PDFs work.`,
		inputSchema: z.object({
			episodeId: z.string(),
			imageBase64: z
				.string()
				.describe(
					"Base64-encoded file bytes (data URI prefix optional). Required only when you actually need OCR — see the description.",
				),
			mimeType: z
				.string()
				.describe(
					"image/jpeg, image/png, image/webp, image/gif, or application/pdf.",
				),
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
			await syncRxIfConfirmed(e, rx);
			return { prescription: toRx(rx) };
		},
	});

export const prescriptionCreateTool = (_env: Env) =>
	createTool({
		id: "prescription_create",
		description: `PREFERRED entry point for creating a prescription from structured data — no file, no OCR, no failure points. Use this whenever you already have the medication/meal list as text or structured items, regardless of how you got them:

  • The platform inlined a PDF the user attached as a <document> block and you can read every line.
  • The user dictated the meds in chat.
  • You copied items from another prescription.
  • A second prescription was added on top of the first one (each rx stays independent — multiple confirmed prescriptions coexist on an episode).

Defaults to status='confirmed' so items appear on the timetable immediately. Each prescription keeps its own sourceNotes so provenance (which vet, which document, which chat snippet) stays traceable.

Only fall back to prescription_upload when you truly do not have the text and need vision/OCR to extract it.`,
		inputSchema: z.object({
			episodeId: z.string(),
			scheduleItems: z
				.array(ScheduleItemSchema)
				.min(1)
				.describe(
					"At least one item. Same shape as prescription_update: name, kind ('medication' | 'meal'), times[] in 'HH:mm' (pet's timezone), optional dosage/route/frequencyHours/durationDays/notes.",
				),
			sourceNotes: z
				.string()
				.optional()
				.describe(
					"Free-text provenance — vet name, prescription date, document reference, dictation context, etc.",
				),
			status: z
				.enum(["draft", "confirmed"])
				.optional()
				.describe(
					"Defaults to 'confirmed' so items appear on the timetable. Pass 'draft' if you want the owner to review before activation.",
				),
		}),
		outputSchema: z.object({ prescription: PrescriptionSchema }),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const rx = await createPrescription(env, {
				episodeId: context.episodeId,
				scheduleItems: context.scheduleItems as ScheduleItem[],
				sourceNotes: context.sourceNotes,
				status: context.status ?? "confirmed",
			});
			await syncRxIfConfirmed(env, rx);
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
			const env = runtimeContext.env as Env;
			const updated = await updatePrescription(env, {
				id: context.prescriptionId,
				scheduleItems: context.scheduleItems as ScheduleItem[] | undefined,
				status: context.status,
				sourceNotes: context.sourceNotes,
			});
			if (updated) await syncRxIfConfirmed(env, updated);
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
