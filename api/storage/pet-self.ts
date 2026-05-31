import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { type Pet, pets } from "../db/schema.ts";
import type { Env } from "../env.ts";

// The well-known id of the only pet this deploy is for. The 0011 migration
// guarantees exactly one pets row exists with this id. Everything that
// historically took a petId now defaults to this constant.
export const PET_SELF_ID = "pet_self";

// Fetch the singleton pet. Returns null only if the migration hasn't run
// yet (very rare — the migration is idempotent and runs at deploy time).
export async function getSelfPet(env: Env): Promise<Pet | null> {
	const rows = await db(env).select().from(pets).where(eq(pets.id, PET_SELF_ID));
	return rows[0] ?? null;
}

// Same, but throws if the row is missing. Use in storage paths where the
// pet is required (e.g. reading timezone for scheduling).
export async function requireSelfPet(env: Env): Promise<Pet> {
	const pet = await getSelfPet(env);
	if (!pet) {
		throw new Error(
			`pet_self row missing — did migration 0011 run? Run \`bun run db:migrate:local\` (or :remote).`,
		);
	}
	return pet;
}
