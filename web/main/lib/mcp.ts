import type { App } from "@modelcontextprotocol/ext-apps/react";

// Tool calls have two transports:
//   1. Studio shell (preferred) — the page is iframed inside Studio, and
//      `app` is the MCP UI extension that proxies tool calls through the
//      Studio app.
//   2. Standalone browser tab — no Studio shell, `app` is null. We fall
//      back to a direct JSON-RPC POST against /api/mcp (the same endpoint
//      Studio talks to). This is what makes `localhost:8788` usable in a
//      plain browser without booting Studio.

let nextRpcId = 1;

const TOKEN_KEY = "tama_mcp_token";

// The standalone browser tab needs to send the MCP bearer token (when the
// deploy has one configured). The owner provides it once via `?token=…` in the
// URL; we persist it to localStorage and strip it from the address bar. Studio
// embeds don't use this path — they call tools through the Studio channel,
// which carries the connection's own token.
function storedMcpToken(): string | null {
	try {
		const url = new URL(window.location.href);
		const fromUrl = url.searchParams.get("token");
		if (fromUrl) {
			localStorage.setItem(TOKEN_KEY, fromUrl);
			url.searchParams.delete("token");
			window.history.replaceState({}, "", url.toString());
			return fromUrl;
		}
		return localStorage.getItem(TOKEN_KEY);
	} catch {
		return null;
	}
}

async function callToolHttp<TOut>(
	name: string,
	args: Record<string, unknown>,
): Promise<TOut> {
	const token = storedMcpToken();
	const res = await fetch("/api/mcp", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			...(token ? { authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: nextRpcId++,
			method: "tools/call",
			params: { name, arguments: args },
		}),
	});
	if (res.status === 401) {
		throw new Error(
			"This pet's MCP is protected. Open the app with ?token=<your-token> once to unlock it.",
		);
	}
	if (!res.ok) {
		throw new Error(`MCP HTTP ${res.status}: ${await res.text()}`);
	}
	// MCP responses come back as SSE-style "event: message\ndata: {…}" when
	// accept includes text/event-stream. A slow tool can interleave other
	// frames (notifications/keep-alives) before the JSON-RPC response, so scan
	// ALL `data:` lines and keep the one carrying result/error — not just the
	// first (the bug that made long calls like exam_explain "fail").
	const raw = await res.text();
	const dataLines = raw
		.split("\n")
		.filter((l) => l.startsWith("data:"))
		.map((l) => l.slice(5).trim())
		.filter(Boolean);
	// biome-ignore lint/suspicious/noExplicitAny: JSON-RPC frame is dynamic
	let json: any = null;
	for (const dl of dataLines) {
		try {
			const obj = JSON.parse(dl);
			if (obj && (obj.result !== undefined || obj.error !== undefined)) {
				json = obj;
			}
		} catch {
			// skip non-JSON frames (comments/keep-alives)
		}
	}
	if (!json) {
		try {
			json = dataLines.length ? JSON.parse(dataLines[0]) : JSON.parse(raw);
		} catch {
			throw new Error(`MCP: could not parse response for ${name}`);
		}
	}
	if (json.error) {
		throw new Error(json.error.message ?? "MCP error");
	}
	const result = json.result;
	if (result?.isError) {
		const text = result.content?.find(
			(c: { type: string; text?: string }) => c.type === "text",
		)?.text ?? "Tool error";
		throw new Error(text);
	}
	if (result?.structuredContent === undefined) {
		throw new Error(`Tool ${name} returned no structured content`);
	}
	return result.structuredContent as TOut;
}

export async function callTool<TOut = unknown>(
	app: App | null,
	name: string,
	args: Record<string, unknown> = {},
): Promise<TOut> {
	if (!app) return callToolHttp<TOut>(name, args);
	const result = await app.callServerTool({ name, arguments: args });
	if (result.isError) {
		const text =
			result.content?.find((c) => c.type === "text")?.text ?? "Tool error";
		throw new Error(text);
	}
	if (result.structuredContent === undefined) {
		throw new Error(`Tool ${name} returned no structured content`);
	}
	return result.structuredContent as TOut;
}
