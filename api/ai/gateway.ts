import type { Env } from "../env.ts";

function gatewayUrl(
	env: Env,
	provider: "anthropic" | "perplexity",
	path: string,
) {
	return `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/${provider}${path}`;
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
