import type { Env } from "../env.ts";

export interface WhisperOptions {
	audio: Uint8Array;
	mimeType: string;
	filename: string;
	// IETF lang tag (e.g. "pt", "en"); omitted → auto-detect.
	language?: string;
}

/**
 * Transcribe an audio chunk via Cloudflare Workers AI (`@cf/openai/whisper-large-v3-turbo`).
 * Billed against your Cloudflare account's unified billing — no OpenAI key
 * required. The model wants base64-encoded audio bytes in the request body.
 *
 * Falls back to the AI-Gateway → OpenAI path only if explicitly requested
 * via env.OPENAI_API_KEY (kept around for parity / cost comparisons).
 */
export async function whisperTranscribe(
	env: Env,
	opts: WhisperOptions,
): Promise<string> {
	// Workers AI path — preferred.
	if (env.AI) {
		const base64 = bytesToBase64(opts.audio);
		const result = (await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
			audio: base64,
			...(opts.language ? { language: opts.language } : {}),
			task: "transcribe",
		})) as { text?: string };
		return result?.text ?? "";
	}

	// Legacy fallback through the AI Gateway → OpenAI. Requires an OpenAI key.
	if (env.OPENAI_API_KEY) {
		return await whisperViaGateway(env, opts);
	}

	throw new Error(
		"No Whisper backend available: env.AI (Workers AI) is not bound and OPENAI_API_KEY is not set.",
	);
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

async function whisperViaGateway(
	env: Env,
	opts: WhisperOptions,
): Promise<string> {
	const url = `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/openai/v1/audio/transcriptions`;
	const form = new FormData();
	form.append("model", "whisper-1");
	if (opts.language) form.append("language", opts.language);
	form.append("response_format", "json");
	const copy = new Uint8Array(opts.audio.byteLength);
	copy.set(opts.audio);
	form.append(
		"file",
		new Blob([copy.buffer], { type: opts.mimeType }),
		opts.filename,
	);

	const headers: Record<string, string> = {};
	if (env.CF_AI_GATEWAY_TOKEN) {
		headers["cf-aig-authorization"] = `Bearer ${env.CF_AI_GATEWAY_TOKEN}`;
	}
	if (env.OPENAI_API_KEY) {
		headers.Authorization = `Bearer ${env.OPENAI_API_KEY}`;
	}

	const res = await fetch(url, { method: "POST", headers, body: form });
	if (!res.ok) {
		throw new Error(`whisper via gateway: ${res.status} ${await res.text()}`);
	}
	const data = (await res.json()) as { text: string };
	return data.text ?? "";
}
