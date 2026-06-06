import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { type Research, researches } from "../db/schema.ts";
import type { Env } from "../env.ts";
import { newId } from "./ids.ts";
import { PET_SELF_ID } from "./pet-self.ts";

export interface SavedResearchInput {
	question: string;
	answer: string;
	keyPoints: string[];
	cautions: string[];
	citations: { title: string; url: string }[];
}

export async function addResearch(
	env: Env,
	input: SavedResearchInput,
): Promise<Research> {
	const [row] = await db(env)
		.insert(researches)
		.values({
			id: newId("res"),
			petId: PET_SELF_ID,
			question: input.question,
			answer: input.answer,
			keyPointsJson: JSON.stringify(input.keyPoints ?? []),
			cautionsJson: JSON.stringify(input.cautions ?? []),
			citationsJson: JSON.stringify(input.citations ?? []),
		})
		.returning();
	return row;
}

export async function listResearches(env: Env): Promise<Research[]> {
	return db(env)
		.select()
		.from(researches)
		.where(eq(researches.petId, PET_SELF_ID))
		.orderBy(desc(researches.createdAt));
}
