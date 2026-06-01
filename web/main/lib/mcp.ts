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

async function callToolHttp<TOut>(
	name: string,
	args: Record<string, unknown>,
): Promise<TOut> {
	const res = await fetch("/api/mcp", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: nextRpcId++,
			method: "tools/call",
			params: { name, arguments: args },
		}),
	});
	if (!res.ok) {
		throw new Error(`MCP HTTP ${res.status}: ${await res.text()}`);
	}
	// MCP responses come back as SSE-style "event: message\ndata: {…}"
	// when accept includes text/event-stream — strip the framing.
	const raw = await res.text();
	const dataLine = raw
		.split("\n")
		.find((l) => l.startsWith("data:"))
		?.slice(5)
		.trim();
	const json = dataLine ? JSON.parse(dataLine) : JSON.parse(raw);
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
