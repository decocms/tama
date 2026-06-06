import type { Env } from "../env.ts";

// Cloudflare AI Gateway expects specific provider slugs in the URL. Perplexity
// is published as `perplexity-ai` — the bare "perplexity" slug returns 400
// with code 2008 "Invalid provider".
const PROVIDER_SLUG: Record<"anthropic" | "perplexity", string> = {
	anthropic: "anthropic",
	perplexity: "perplexity-ai",
};

function gatewayUrl(
	env: Env,
	provider: "anthropic" | "perplexity",
	path: string,
) {
	const slug = PROVIDER_SLUG[provider];
	return `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/${slug}${path}`;
}

// Workers AI through the AI Gateway, by REST. The `env.AI` binding only runs
// when deployed (or `wrangler dev --remote`) — in plain local dev it throws
// "Binding AI needs to be run remotely". The REST route is a normal fetch, so
// it works everywhere as long as a Cloudflare API token with Workers AI
// permission is available (CF_API_TOKEN; falls back to the gateway token).
function workersAiUrl(env: Env, model: string) {
	return `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/workers-ai/${model}`;
}

// Run a Workers AI model via REST and return the raw response bytes (for image
// models like img2img, the body IS the PNG). Throws with a helpful message if
// no token is configured.
export async function workersAiRunBytes(
	env: Env,
	model: string,
	// biome-ignore lint/suspicious/noExplicitAny: model inputs are heterogeneous
	body: any,
): Promise<Uint8Array> {
	const token = env.CF_API_TOKEN || env.CF_AI_GATEWAY_TOKEN;
	if (!token) {
		throw new Error(
			"Workers AI REST needs a Cloudflare API token. Set CF_API_TOKEN in .dev.vars (a token with the 'Workers AI: Read' permission), or run `wrangler dev --remote` to use the AI binding instead.",
		);
	}
	const headers: Record<string, string> = {
		"content-type": "application/json",
		Authorization: `Bearer ${token}`,
		...gatewayAuthHeader(env),
	};
	const res = await fetch(workersAiUrl(env, model), {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		throw new Error(`workers-ai via gateway: ${res.status} ${await res.text()}`);
	}
	return new Uint8Array(await res.arrayBuffer());
}

// Gateway-level auth (set when "Authenticated Gateway" is enabled in the dashboard).
function gatewayAuthHeader(env: Env): Record<string, string> {
	return env.CF_AI_GATEWAY_TOKEN
		? { "cf-aig-authorization": `Bearer ${env.CF_AI_GATEWAY_TOKEN}` }
		: {};
}

export interface AnthropicMessagesBody {
	model: string;
	max_tokens: number;
	system?: string;
	// biome-ignore lint/suspicious/noExplicitAny: anthropic content blocks are heterogeneous
	messages: { role: "user" | "assistant"; content: any }[];
}

export async function anthropicMessages(env: Env, body: AnthropicMessagesBody) {
	const headers: Record<string, string> = {
		"content-type": "application/json",
		"anthropic-version": "2023-06-01",
		...gatewayAuthHeader(env),
	};
	// If you've set up BYOK in the gateway dashboard, the gateway injects the
	// key server-side and ANTHROPIC_API_KEY can be empty.
	if (env.ANTHROPIC_API_KEY) headers["x-api-key"] = env.ANTHROPIC_API_KEY;

	const res = await fetch(gatewayUrl(env, "anthropic", "/v1/messages"), {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		throw new Error(`anthropic via gateway: ${res.status} ${await res.text()}`);
	}
	return (await res.json()) as {
		content: { type: "text"; text: string }[];
		stop_reason: string;
	};
}

export interface PerplexityChatBody {
	model: string;
	messages: { role: "system" | "user" | "assistant"; content: string }[];
	max_tokens?: number;
	return_citations?: boolean;
}

export async function perplexityChat(env: Env, body: PerplexityChatBody) {
	const headers: Record<string, string> = {
		"content-type": "application/json",
		...gatewayAuthHeader(env),
	};
	if (env.PERPLEXITY_API_KEY) {
		headers.Authorization = `Bearer ${env.PERPLEXITY_API_KEY}`;
	}

	const res = await fetch(gatewayUrl(env, "perplexity", "/chat/completions"), {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		throw new Error(
			`perplexity via gateway: ${res.status} ${await res.text()}`,
		);
	}
	return (await res.json()) as {
		choices: { message: { content: string } }[];
		citations?: string[];
	};
}
