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

export async function deleteEpisode(env: Env, id: string): Promise<boolean> {
	const now = new Date().toISOString();
	const result = await db(env)
		.update(episodes)
		.set({ deletedAt: now })
		.where(and(eq(episodes.id, id), isNull(episodes.deletedAt)))
		.returning();
	return result.length > 0;
}
