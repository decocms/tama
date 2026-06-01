import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import type { Env } from "../env.ts";
import { sendPush } from "../notifications/webpush.ts";
import { PET_SELF_ID } from "../storage/pet-self.ts";
import {
	deletePushSubscriptionByEndpoint,
	listPushSubscriptions,
	upsertPushSubscription,
} from "../storage/push-subscriptions.ts";

// Surfaces the VAPID public key to the frontend so PushManager.subscribe()
// can use it as applicationServerKey. Public by design — that's literally
// what VAPID public keys are for.
export const pushVapidPublicKeyTool = (_env: Env) =>
	createTool({
		id: "push_vapid_public_key",
		description:
			"Returns the VAPID public key the browser should use when subscribing to push notifications.",
		inputSchema: z.object({}),
		outputSchema: z.object({ publicKey: z.string() }),
		annotations: { readOnlyHint: true },
		execute: async ({ runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const key = env.VAPID_PUBLIC_KEY;
			if (!key) {
				throw new Error(
					"VAPID_PUBLIC_KEY is not set on the worker — generate with `npx web-push generate-vapid-keys` and put it in .dev.vars / wrangler secrets.",
				);
			}
			return { publicKey: key };
		},
	});

export const pushSubscribeTool = (_env: Env) =>
	createTool({
		id: "push_subscribe",
		description:
			"Register a browser push subscription so the worker can deliver medicine reminders. Endpoint is upserted — re-subscribing from the same browser is idempotent.",
		inputSchema: z.object({
			endpoint: z.string().url(),
			p256dh: z
				.string()
				.describe(
					"base64url-encoded subscriber public key (from PushSubscription.getKey('p256dh'))",
				),
			auth: z
				.string()
				.describe(
					"base64url-encoded auth secret (from PushSubscription.getKey('auth'))",
				),
			userAgent: z.string().optional().nullable(),
		}),
		outputSchema: z.object({
			id: z.string(),
			endpoint: z.string(),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const row = await upsertPushSubscription(env, {
				endpoint: context.endpoint,
				p256dh: context.p256dh,
				auth: context.auth,
				petId: PET_SELF_ID,
				userAgent: context.userAgent ?? null,
			});
			return { id: row.id, endpoint: row.endpoint };
		},
	});

export const pushUnsubscribeTool = (_env: Env) =>
	createTool({
		id: "push_unsubscribe",
		description: "Remove a push subscription by its endpoint URL.",
		inputSchema: z.object({ endpoint: z.string().url() }),
		outputSchema: z.object({ deleted: z.boolean() }),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const deleted = await deletePushSubscriptionByEndpoint(
				env,
				context.endpoint,
			);
			return { deleted };
		},
	});

export const pushTestTool = (_env: Env) =>
	createTool({
		id: "push_test",
		description:
			"Send a test notification to all registered subscriptions (or just one if endpoint is provided). Useful for verifying VAPID keys + service worker without waiting on cron.",
		inputSchema: z.object({
			endpoint: z.string().url().optional(),
			title: z.string().optional(),
			body: z.string().optional(),
		}),
		outputSchema: z.object({
			attempted: z.number(),
			sent: z.number(),
			pruned: z.number(),
			errors: z.number(),
			results: z.array(
				z.object({
					endpoint: z.string(),
					ok: z.boolean(),
					status: z.number(),
					removed: z.boolean().optional(),
					error: z.string().optional(),
				}),
			),
		}),
		execute: async ({ context, runtimeContext }) => {
			const env = runtimeContext.env as Env;
			const all = await listPushSubscriptions(env);
			const targets = context.endpoint
				? all.filter((s) => s.endpoint === context.endpoint)
				: all;
			const payload = {
				title: context.title ?? "Tama test",
				body: context.body ?? "If you see this, push notifications work.",
				url: "/",
				tag: "push-test",
			};
			let sent = 0;
			let pruned = 0;
			let errors = 0;
			const results = [] as Array<{
				endpoint: string;
				ok: boolean;
				status: number;
				removed?: boolean;
				error?: string;
			}>;
			for (const sub of targets) {
				const r = await sendPush(env, sub, payload);
				if (r.ok) sent++;
				else if (r.removed) pruned++;
				else errors++;
				results.push({
					endpoint: sub.endpoint,
					ok: r.ok,
					status: r.status,
					removed: r.removed,
					error: r.error,
				});
			}
			return { attempted: targets.length, sent, pruned, errors, results };
		},
	});
