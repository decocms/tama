import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.ts";
import { type Episode, episodes, type Note, notes } from "../db/schema.ts";
import type { Env } from "../env.ts";
import { newId } from "./ids.ts";

export interface StartEpisodeInput {
	petId: string;
	title: string;
	summary?: string;
}

export async function startEpisode(
	env: Env,
	input: StartEpisodeInput,
): Promise<Episode> {
	const id = newId("ep");
	const [row] = await db(env)
		.insert(episodes)
		.values({
			id,
			petId: input.petId,
			title: input.title,
			summary: input.summary,
		})
		.returning();
	return row;
}

export async function getEpisode(
	env: Env,
	id: string,
): Promise<Episode | null> {
	const rows = await db(env)
		.select()
		.from(episodes)
		.where(and(eq(episodes.id, id), isNull(episodes.deletedAt)));
	return rows[0] ?? null;
}

export async function listEpisodes(
	env: Env,
	petId?: string,
): Promise<Episode[]> {
	const where = petId
		? and(eq(episodes.petId, petId), isNull(episodes.deletedAt))
		: isNull(episodes.deletedAt);
	return db(env)
		.select()
		.from(episodes)
		.where(where)
		.orderBy(desc(episodes.startedAt));
}

export async function endEpisode(
	env: Env,
	id: string,
	summary?: string,
): Promise<Episode | null> {
	const [row] = await db(env)
		.update(episodes)
		.set({
			status: "closed",
			endedAt: new Date().toISOString(),
			summary: summary,
		})
		.where(eq(episodes.id, id))
		.returning();
	return row ?? null;
}

export interface AddNoteInput {
	episodeId: string;
	kind: "text" | "chatlog" | "ai-summary";
	content: string;
	aiSummary?: string;
}

export async function addNote(env: Env, input: AddNoteInput): Promise<Note> {
	const id = newId("note");
	const [row] = await db(env)
		.insert(notes)
		.values({
			id,
			episodeId: input.episodeId,
			kind: input.kind,
			content: input.content,
			aiSummary: input.aiSummary,
		})
		.returning();
	return row;
}

export async function listNotes(env: Env, episodeId: string): Promise<Note[]> {
	return db(env)
		.select()
		.from(notes)
		.where(eq(notes.episodeId, episodeId))
		.orderBy(desc(notes.createdAt));
}

export interface UpdateEpisodeInput {
	title?: string;
	summary?: string | null;
	startedAt?: string;
	status?: "open" | "closed";
	endedAt?: string | null;
}

export async function updateEpisode(
	env: Env,
	id: string,
	patch: UpdateEpisodeInput,
): Promise<Episode | null> {
	const writable: Partial<typeof episodes.$inferInsert> = {};
	if (patch.title !== undefined) writable.title = patch.title;
	if (patch.summary !== undefined) writable.summary = patch.summary;
	if (patch.startedAt !== undefined) writable.startedAt = patch.startedAt;
	if (patch.status !== undefined) writable.status = patch.status;
	if (patch.endedAt !== undefined) writable.endedAt = patch.endedAt;
	if (Object.keys(writable).length === 0) return getEpisode(env, id);
	const [row] = await db(env)
		.update(episodes)
		.set(writable)
		.where(eq(episodes.id, id))
		.returning();
	return row ?? null;
}

// The episode's "summary" field doubles as its live status — it's the line
// shown under the title in the hero. AI insights overwrites it with the
// latest status bullet so opening the episode always shows the current read.
// We also stamp currentStatusAt as a freshness indicator (UI can show
// "Updated 2h ago"); summary itself stays the single source of truth.
export async function setEpisodeStatus(
	env: Env,
	id: string,
	status: string | null,
): Promise<Episode | null> {
	const [row] = await db(env)
		.update(episodes)
		.set({
			summary: status,
			currentStatus: status,
			currentStatusAt: status ? new Date().toISOString() : null,
		})
		.where(eq(episodes.id, id))
		.returning();
	return row ?? null;
}

export async function deleteEpisode(env: Env, id: string): Promise<boolean> {
	const now = new Date().toISOString();
	const result = await db(env)
		.update(episodes)
		.set({ deletedAt: now })
		.where(and(eq(episodes.id, id), isNull(episodes.deletedAt)))
		.returning();
	return result.length > 0;
}
