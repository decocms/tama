import { asc, eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
	type Recording,
	type RecordingChunk,
	recordingChunks,
	recordings,
} from "../db/schema.ts";
import type { Env } from "../env.ts";
import { newId } from "./ids.ts";
import { PET_SELF_ID } from "./pet-self.ts";

export interface CreateRecordingInput {
	mimeType: string;
	originalName?: string;
	durationS?: number;
	numChunks: number;
	originalFileId?: string;
}

export async function createRecording(
	env: Env,
	input: CreateRecordingInput,
): Promise<Recording> {
	const id = newId("rec");
	const [row] = await db(env)
		.insert(recordings)
		.values({
			id,
			petId: PET_SELF_ID,
			mimeType: input.mimeType,
			originalName: input.originalName,
			durationS: input.durationS,
			numChunks: input.numChunks,
			originalFileId: input.originalFileId,
			status: "uploading",
		})
		.returning();
	return row;
}

export async function getRecording(
	env: Env,
	id: string,
): Promise<Recording | null> {
	const rows = await db(env)
		.select()
		.from(recordings)
		.where(eq(recordings.id, id));
	return rows[0] ?? null;
}

export async function listRecordings(env: Env): Promise<Recording[]> {
	return db(env)
		.select()
		.from(recordings)
		.where(eq(recordings.petId, PET_SELF_ID))
		.orderBy(asc(recordings.createdAt));
}

export async function updateRecording(
	env: Env,
	id: string,
	patch: Partial<typeof recordings.$inferInsert>,
): Promise<Recording | null> {
	const [row] = await db(env)
		.update(recordings)
		.set(patch)
		.where(eq(recordings.id, id))
		.returning();
	return row ?? null;
}

export interface AddChunkInput {
	recordingId: string;
	idx: number;
	fileId: string;
	startS: number;
	endS: number;
}

export async function addChunk(
	env: Env,
	input: AddChunkInput,
): Promise<RecordingChunk> {
	const id = newId("chk");
	const [row] = await db(env)
		.insert(recordingChunks)
		.values({
			id,
			recordingId: input.recordingId,
			idx: input.idx,
			fileId: input.fileId,
			startS: input.startS,
			endS: input.endS,
		})
		.returning();
	return row;
}

export async function listChunks(
	env: Env,
	recordingId: string,
): Promise<RecordingChunk[]> {
	return db(env)
		.select()
		.from(recordingChunks)
		.where(eq(recordingChunks.recordingId, recordingId))
		.orderBy(asc(recordingChunks.idx));
}

export async function setChunkTranscript(
	env: Env,
	chunkId: string,
	transcript: string,
): Promise<RecordingChunk | null> {
	const [row] = await db(env)
		.update(recordingChunks)
		.set({
			transcript,
			transcribedAt: new Date().toISOString(),
		})
		.where(eq(recordingChunks.id, chunkId))
		.returning();
	return row ?? null;
}
