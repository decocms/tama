import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { type Symptom, symptoms } from "../db/schema.ts";
import type { Env } from "../env.ts";
import { newId } from "./ids.ts";
import { PET_SELF_ID } from "./pet-self.ts";

export interface AddSymptomInput {
	description: string;
	observedAt?: string;
	severity?: "mild" | "moderate" | "severe" | null;
	resolvedAt?: string | null;
}

export async function addSymptom(
	env: Env,
	input: AddSymptomInput,
): Promise<Symptom> {
	const id = newId("sym");
	const [row] = await db(env)
		.insert(symptoms)
		.values({
			id,
			petId: PET_SELF_ID,
			description: input.description,
			observedAt: input.observedAt ?? new Date().toISOString(),
			severity: input.severity ?? null,
			resolvedAt: input.resolvedAt ?? null,
		})
		.returning();
	return row;
}

export async function listSymptoms(env: Env): Promise<Symptom[]> {
	return db(env)
		.select()
		.from(symptoms)
		.where(eq(symptoms.petId, PET_SELF_ID))
		.orderBy(desc(symptoms.observedAt));
}

export async function resolveSymptom(
	env: Env,
	id: string,
	resolvedAt?: string,
): Promise<Symptom | null> {
	const [row] = await db(env)
		.update(symptoms)
		.set({ resolvedAt: resolvedAt ?? new Date().toISOString() })
		.where(eq(symptoms.id, id))
		.returning();
	return row ?? null;
}

export async function deleteSymptom(env: Env, id: string): Promise<boolean> {
	const out = await db(env)
		.delete(symptoms)
		.where(eq(symptoms.id, id))
		.returning({ id: symptoms.id });
	return out.length > 0;
}
