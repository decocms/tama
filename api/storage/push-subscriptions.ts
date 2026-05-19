import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { type PushSubscriptionRow, pushSubscriptions } from "../db/schema.ts";
import type { Env } from "../env.ts";
import { newId } from "./ids.ts";

export type PushSubscription = PushSubscriptionRow;

export interface UpsertPushSubscriptionInput {
	endpoint: string;
	p256dh: string;
	auth: string;
	petId?: string | null;
	userAgent?: string | null;
}

// Endpoint is UNIQUE; re-subscribing from the same browser is idempotent and
// refreshes the latest keys (browsers occasionally rotate them).
export async function upsertPushSubscription(
	env: Env,
	input: UpsertPushSubscriptionInput,
): Promise<PushSubscription> {
	const existing = await db(env)
		.select()
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.endpoint, input.endpoint));
	if (existing[0]) {
		const [updated] = await db(env)
			.update(pushSubscriptions)
			.set({
				p256dh: input.p256dh,
				auth: input.auth,
				petId: input.petId ?? existing[0].petId,
				userAgent: input.userAgent ?? existing[0].userAgent,
			})
			.where(eq(pushSubscriptions.id, existing[0].id))
			.returning();
		return updated;
	}
	const [row] = await db(env)
		.insert(pushSubscriptions)
		.values({
			id: newId("psub"),
			endpoint: input.endpoint,
			p256dh: input.p256dh,
			auth: input.auth,
			petId: input.petId ?? null,
			userAgent: input.userAgent ?? null,
		})
		.returning();
	return row;
}

export async function deletePushSubscriptionByEndpoint(
	env: Env,
	endpoint: string,
): Promise<boolean> {
	const result = await db(env)
		.delete(pushSubscriptions)
		.where(eq(pushSubscriptions.endpoint, endpoint))
		.returning();
	return result.length > 0;
}

export async function listPushSubscriptions(
	env: Env,
): Promise<PushSubscription[]> {
	return db(env).select().from(pushSubscriptions);
}

export async function listPushSubscriptionsForPet(
	env: Env,
	petId: string,
): Promise<PushSubscription[]> {
	return db(env)
		.select()
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.petId, petId));
}
