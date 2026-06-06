import type { DefaultEnv } from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({});

export interface Bindings {
	DB: D1Database;
	FILES: R2Bucket;
	ASSETS: Fetcher;
	// Workers AI — Cloudflare-hosted models (Whisper, etc.). Billed via
	// unified Cloudflare billing; no external API key needed.
	// biome-ignore lint/suspicious/noExplicitAny: Cloudflare AI binding has no public type
	AI: any;
	AI_GATEWAY_ACCOUNT_ID: string;
	AI_GATEWAY_NAME: string;
	// Secrets — empty string when unset. In local dev they come from .dev.vars;
	// in production from `wrangler secret put`.
	CF_AI_GATEWAY_TOKEN?: string;
	// Cloudflare API token with "Workers AI: Read" permission. Only needed to
	// run Workers AI (the raster sprite img2img) via REST in local dev — the
	// `env.AI` binding can't run locally without `wrangler dev --remote`.
	CF_API_TOKEN?: string;
	ANTHROPIC_API_KEY?: string;
	PERPLEXITY_API_KEY?: string;
	OPENAI_API_KEY?: string;
	// Web Push / VAPID. Public key is also surfaced to the frontend via the
	// push_vapid_public_key tool (VAPID public keys are inherently public).
	// Generate with `npx web-push generate-vapid-keys` once per environment.
	VAPID_PUBLIC_KEY?: string;
	VAPID_PRIVATE_KEY?: string;
	VAPID_SUBJECT?: string;
}

export type Env = DefaultEnv<typeof StateSchema> & Bindings;
