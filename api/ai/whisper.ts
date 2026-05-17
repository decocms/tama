import type { Env } from "../env.ts";

function gatewayUrl(env: Env, path: string) {
	return `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_NAME}/openai${path}`;
}

export interface WhisperOptions {
	audio: Uint8Array;
	mimeType: string;
	filename: string;
	language?: string; // e.g. "pt" for Portuguese; omitted → auto-detect
}

// Transcribe an audio chunk via OpenAI Whisper through Cloudflare AI Gateway.
// Billed against the gateway's credits — no provider key needed in the Worker.
export async function whisperTranscribe(
	env: Env,
	opts: WhisperOptions,
): Promise<string> {
	const form = new FormData();
	form.append("model", "whisper-1");
	if (opts.language) form.append("language", opts.language);
	form.append("response_format", "json");
	// Copy into a fresh ArrayBuffer so the Blob ctor's strict BlobPart typing is happy.
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

	const res = await fetch(gatewayUrl(env, "/v1/audio/transcriptions"), {
		method: "POST",
		headers,
		body: form,
	});
	if (!res.ok) {
		throw new Error(`whisper via gateway: ${res.status} ${await res.text()}`);
	}
	const data = (await res.json()) as { text: string };
	return data.text ?? "";
}
