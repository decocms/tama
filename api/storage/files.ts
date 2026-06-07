import { desc, eq, notInArray } from "drizzle-orm";
import { db } from "../db/client.ts";
import { type FileRow, files, recordingChunks } from "../db/schema.ts";
import type { Env } from "../env.ts";
import { newId } from "./ids.ts";

// All uploaded files, newest first. Single-tenant, so no pet scoping needed —
// every file belongs to the one pet.
export async function listFiles(env: Env): Promise<FileRow[]> {
	return db(env).select().from(files).orderBy(desc(files.uploadedAt));
}

// The Assets library view: every file EXCEPT recording chunks. Each voice
// recording stores its original audio plus per-chunk re-encodings
// (chunk-0.wav, …) used only for transcription — pipeline internals that would
// otherwise clutter Assets with duplicates of the original upload.
export async function listAssetFiles(env: Env): Promise<FileRow[]> {
	const chunkFileIds = (
		await db(env)
			.select({ fileId: recordingChunks.fileId })
			.from(recordingChunks)
	)
		.map((r) => r.fileId)
		.filter((id): id is string => id != null);

	const q = db(env).select().from(files);
	const rows = chunkFileIds.length
		? await q.where(notInArray(files.id, chunkFileIds)).orderBy(desc(files.uploadedAt))
		: await q.orderBy(desc(files.uploadedAt));
	return rows;
}

const EXT_BY_MIME: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/png": "png",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/heic": "heic",
	"application/pdf": "pdf",
};

function extFor(mimeType: string): string {
	return EXT_BY_MIME[mimeType.toLowerCase()] ?? "bin";
}

function base64ToBytes(b64: string): Uint8Array {
	const clean = b64.replace(/^data:[^,]+,/, "");
	const binary = atob(clean);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export interface SaveFileInput {
	base64: string;
	mimeType: string;
	originalName?: string;
	kind?: "prescription" | "exam" | "other";
}

// Save raw bytes (e.g. an in-Worker generated PNG from Workers AI) to R2 +
// the files table. Same shape as saveFile but skips the base64 decode.
export async function saveFileFromBytes(
	env: Env,
	input: {
		bytes: Uint8Array;
		mimeType: string;
		originalName?: string;
		kind?: "prescription" | "exam" | "other";
	},
): Promise<FileRow> {
	const id = newId("file");
	const ext = extFor(input.mimeType);
	const r2Key = `${input.kind ?? "other"}/${id}.${ext}`;
	await env.FILES.put(r2Key, input.bytes, {
		httpMetadata: { contentType: input.mimeType },
	});
	const [row] = await db(env)
		.insert(files)
		.values({
			id,
			r2Key,
			mimeType: input.mimeType,
			originalName: input.originalName,
			kind: input.kind ?? "other",
		})
		.returning();
	return row;
}

export async function saveFile(
	env: Env,
	input: SaveFileInput,
): Promise<FileRow> {
	const id = newId("file");
	const ext = extFor(input.mimeType);
	const r2Key = `${input.kind ?? "prescription"}/${id}.${ext}`;
	const bytes = base64ToBytes(input.base64);
	await env.FILES.put(r2Key, bytes, {
		httpMetadata: { contentType: input.mimeType },
	});

	const [row] = await db(env)
		.insert(files)
		.values({
			id,
			r2Key,
			mimeType: input.mimeType,
			originalName: input.originalName,
			kind: input.kind ?? "prescription",
		})
		.returning();
	return row;
}

export async function getFile(
	env: Env,
	fileId: string,
): Promise<FileRow | null> {
	const rows = await db(env).select().from(files).where(eq(files.id, fileId));
	return rows[0] ?? null;
}

export async function readFileBytes(
	env: Env,
	r2Key: string,
): Promise<ArrayBuffer | null> {
	const obj = await env.FILES.get(r2Key);
	if (!obj) return null;
	return await obj.arrayBuffer();
}
